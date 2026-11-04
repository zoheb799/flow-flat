import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { authorizeHouseholdRole } from "@/lib/auth/authorize";
import { getDb, schema } from "@/lib/db";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { contributionBatchSchema } from "@/lib/validation/contribution-batch";

export async function addWalletContributionBatch(rawInput: unknown) {
  const input = contributionBatchSchema.parse(rawInput);
  const { user } = await authorizeHouseholdRole(input.householdId, ["ADMIN"]);
  if (!await consumeRateLimit("wallet-contribution", `${input.householdId}:${user.id}`, 40, 60 * 60 * 1000)) {
    throw new Error("Too many contribution requests. Try again later.");
  }

  const memberIds = input.contributions.map(({ memberId }) => memberId);
  const idempotencyKeys = memberIds.map((memberId) => `${input.idempotencyKey}:${memberId}`);
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.householdId}), hashtext(${input.idempotencyKey}))`);
    const existing = await tx.select({ id: schema.walletTransactions.id })
      .from(schema.walletTransactions)
      .where(and(
        eq(schema.walletTransactions.householdId, input.householdId),
        inArray(schema.walletTransactions.idempotencyKey, idempotencyKeys),
      ));
    if (existing.length === input.contributions.length) return existing;
    if (existing.length) throw new Error("This contribution batch is incomplete; use a new request and retry.");

    const wallets = await tx.select({
      id: schema.wallets.id,
      memberId: schema.wallets.memberId,
      balancePaise: schema.wallets.balancePaise,
    })
      .from(schema.wallets)
      .where(and(
        eq(schema.wallets.householdId, input.householdId),
        inArray(schema.wallets.memberId, memberIds),
      ))
      .orderBy(schema.wallets.memberId)
      .for("update");
    if (wallets.length !== input.contributions.length) throw new Error("One or more member wallets were not found.");

    const walletByMemberId = new Map(wallets.map((wallet) => [wallet.memberId, wallet]));
    for (const contribution of input.contributions) {
      const wallet = walletByMemberId.get(contribution.memberId);
      if (!wallet) throw new Error("One or more member wallets were not found.");
      if (wallet.balancePaise + contribution.amountPaise > Number.MAX_SAFE_INTEGER) {
        throw new Error("Contribution would exceed the maximum supported wallet balance.");
      }
    }

    const transactions = await tx.insert(schema.walletTransactions).values(input.contributions.map((contribution, index) => {
      const wallet = walletByMemberId.get(contribution.memberId);
      if (!wallet) throw new Error("One or more member wallets were not found.");
      return {
        householdId: input.householdId,
        walletId: wallet.id,
        memberId: contribution.memberId,
        type: "CONTRIBUTION" as const,
        amountPaise: contribution.amountPaise,
        description: input.description,
        idempotencyKey: idempotencyKeys[index],
        createdBy: user.id,
      };
    })).returning({ id: schema.walletTransactions.id, memberId: schema.walletTransactions.memberId, amountPaise: schema.walletTransactions.amountPaise });

    for (const contribution of input.contributions) {
      const wallet = walletByMemberId.get(contribution.memberId);
      if (!wallet) throw new Error("One or more member wallets were not found.");
      await tx.update(schema.wallets)
        .set({
          balancePaise: sql`${schema.wallets.balancePaise} + ${contribution.amountPaise}`,
          updatedAt: new Date(),
        })
        .where(eq(schema.wallets.id, wallet.id));
    }

    await tx.insert(schema.notifications).values(transactions.map((transaction) => ({
      householdId: input.householdId,
      userId: transaction.memberId,
      type: "WALLET_CREDIT" as const,
      title: "Your wallet was credited",
      message: `${input.description} · ₹${(transaction.amountPaise / 100).toFixed(2)}.`,
      href: "/dashboard",
    })));
    await tx.insert(schema.auditLogs).values(transactions.map((transaction) => ({
      householdId: input.householdId,
      actorId: user.id,
      action: "WALLET_CONTRIBUTION",
      resourceType: "WALLET_TRANSACTION",
      resourceId: transaction.id,
      details: { memberId: transaction.memberId, amountPaise: transaction.amountPaise },
    })));

    return transactions;
  });
}
