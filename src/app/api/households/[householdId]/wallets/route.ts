import { and, desc, eq, inArray, gte } from "drizzle-orm";
import { AuthorizationError, authorizationResponse, authorizeHouseholdAccess } from "@/lib/auth/authorize";
import { getDb, schema } from "@/lib/db";

type RouteContext = { params: Promise<{ householdId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { householdId } = await params;
    const { user, role } = await authorizeHouseholdAccess(householdId);
    const memberFilter = role === "ADMIN"
      ? undefined
      : eq(schema.wallets.memberId, user.id);
    const wallets = await getDb().select({
      id: schema.wallets.id,
      memberId: schema.wallets.memberId,
      memberName: schema.users.name,
      balancePaise: schema.wallets.balancePaise,
      lowBalancePaise: schema.wallets.lowBalancePaise,
    })
      .from(schema.wallets)
      .innerJoin(schema.users, eq(schema.users.id, schema.wallets.memberId))
      .where(and(eq(schema.wallets.householdId, householdId), memberFilter));

    if (!wallets.length) return Response.json({ error: "Wallet not found." }, { status: 404 });
    const memberIds = wallets.map((wallet) => wallet.memberId);
    const currentPeriodStart = new Date();
    currentPeriodStart.setUTCDate(1);
    currentPeriodStart.setUTCHours(0, 0, 0, 0);
    const transactions = await getDb().select({
      id: schema.walletTransactions.id,
      memberId: schema.walletTransactions.memberId,
      memberName: schema.users.name,
      type: schema.walletTransactions.type,
      amountPaise: schema.walletTransactions.amountPaise,
      description: schema.walletTransactions.description,
      createdAt: schema.walletTransactions.createdAt,
    })
      .from(schema.walletTransactions)
      .innerJoin(schema.users, eq(schema.users.id, schema.walletTransactions.memberId))
      .where(and(
        eq(schema.walletTransactions.householdId, householdId),
        inArray(schema.walletTransactions.memberId, memberIds),
      ))
      .orderBy(desc(schema.walletTransactions.createdAt))
      .limit(250);
    const monthTransactions = await getDb().select({
      memberId: schema.walletTransactions.memberId,
      type: schema.walletTransactions.type,
      amountPaise: schema.walletTransactions.amountPaise,
    })
      .from(schema.walletTransactions)
      .where(and(
        eq(schema.walletTransactions.householdId, householdId),
        inArray(schema.walletTransactions.memberId, memberIds),
        gte(schema.walletTransactions.createdAt, currentPeriodStart),
      ));

    const summaries = wallets.map((wallet) => {
      const currentMonth = monthTransactions.filter((transaction) => transaction.memberId === wallet.memberId);
      return {
        ...wallet,
        monthlyContributionsPaise: currentMonth
          .filter((transaction) => transaction.type === "CONTRIBUTION")
          .reduce((total, transaction) => total + transaction.amountPaise, 0),
        monthlySpentPaise: currentMonth
          .filter((transaction) => transaction.type === "MEAL_DEBIT")
            .reduce((total, transaction) => total + transaction.amountPaise, 0) -
          currentMonth
            .filter((transaction) => transaction.type === "MEAL_REFUND")
            .reduce((total, transaction) => total + transaction.amountPaise, 0),
      };
    });

    return Response.json({ wallets: summaries, transactions });
  } catch (error) {
    const response = authorizationResponse(error);
    if (response) return response;
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Failed to load wallet ledger.", error);
    return Response.json({ error: "Unable to load wallet ledger." }, { status: 500 });
  }
}
