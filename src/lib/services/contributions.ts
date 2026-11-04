import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { authorizeHouseholdRole } from "@/lib/auth/authorize";
import { getDb, schema } from "@/lib/db";
import { contributionSchema } from "@/lib/validation/contribution";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export async function addWalletContribution(rawInput: unknown) {
  const input = contributionSchema.parse(rawInput);
  const { user } = await authorizeHouseholdRole(input.householdId, ["ADMIN"]);
  if (!await consumeRateLimit("wallet-contribution", `${input.householdId}:${user.id}`, 40, 60 * 60 * 1000)) {
    throw new Error("Too many contribution requests. Try again later.");
  }
  const db = getDb();

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.householdId}), hashtext(${input.idempotencyKey}))`);
    const [existing] = await tx.select({ id: schema.walletTransactions.id })
      .from(schema.walletTransactions)
      .where(and(
        eq(schema.walletTransactions.householdId, input.householdId),
        eq(schema.walletTransactions.idempotencyKey, input.idempotencyKey),
      ))
      .limit(1);
    if (existing) return existing;

    const [wallet] = await tx.select({
      id: schema.wallets.id,
      balancePaise: schema.wallets.balancePaise,
    })
      .from(schema.wallets)
      .where(and(
        eq(schema.wallets.householdId, input.householdId),
        eq(schema.wallets.memberId, input.memberId),
      ))
      .for("update");
    if (!wallet) throw new Error("Member wallet not found.");
    if (wallet.balancePaise + input.amountPaise > Number.MAX_SAFE_INTEGER) {
      throw new Error("Contribution would exceed the maximum supported wallet balance.");
    }

    const [transaction] = await tx.insert(schema.walletTransactions).values({
      householdId: input.householdId,
      walletId: wallet.id,
      memberId: input.memberId,
      type: "CONTRIBUTION",
      amountPaise: input.amountPaise,
      description: input.description,
      idempotencyKey: input.idempotencyKey,
      createdBy: user.id,
    }).returning({ id: schema.walletTransactions.id });

    await tx.update(schema.wallets)
      .set({
        balancePaise: sql`${schema.wallets.balancePaise} + ${input.amountPaise}`,
        updatedAt: new Date(),
      })
      .where(eq(schema.wallets.id, wallet.id));

    await tx.insert(schema.notifications).values({
      householdId: input.householdId,
      userId: input.memberId,
      type: "WALLET_CREDIT",
      title: "Your wallet was credited",
      message: `${input.description} · ₹${(input.amountPaise / 100).toFixed(2)}.`,
      href: "/dashboard",
    });

    await tx.insert(schema.auditLogs).values({
      householdId: input.householdId,
      actorId: user.id,
      action: "WALLET_CONTRIBUTION",
      resourceType: "WALLET_TRANSACTION",
      resourceId: transaction.id,
      details: { memberId: input.memberId, amountPaise: input.amountPaise },
    });
    return transaction;
  });
}
