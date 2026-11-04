import { and, asc, eq, sum } from "drizzle-orm";
import { AuthorizationError, authorizationResponse, authorizeHouseholdAccess } from "@/lib/auth/authorize";
import { getOrCreateCurrentFund } from "@/lib/services/common-fund";
import { getDb, schema } from "@/lib/db";

type RouteContext = { params: Promise<{ householdId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { householdId } = await params;
    await authorizeHouseholdAccess(householdId);
    const fund = await getOrCreateCurrentFund(householdId);
    const db = getDb();
    const [contributionTotals] = await db.select({
      amountPaise: sum(schema.commonFundContributions.amountPaise).mapWith(Number),
    }).from(schema.commonFundContributions)
      .where(and(
        eq(schema.commonFundContributions.householdId, householdId),
        eq(schema.commonFundContributions.fundId, fund.id),
      ));
    const [expenseTotals] = await db.select({
      amountPaise: sum(schema.commonExpenses.amountPaise).mapWith(Number),
    }).from(schema.commonExpenses)
      .where(and(
        eq(schema.commonExpenses.householdId, householdId),
        eq(schema.commonExpenses.fundId, fund.id),
      ));
    const contributions = await db.select({
      id: schema.commonFundContributions.id,
      memberId: schema.commonFundContributions.memberId,
      name: schema.users.name,
      amountPaise: schema.commonFundContributions.amountPaise,
      createdAt: schema.commonFundContributions.createdAt,
    })
      .from(schema.commonFundContributions)
      .innerJoin(schema.users, eq(schema.users.id, schema.commonFundContributions.memberId))
      .where(and(
        eq(schema.commonFundContributions.householdId, householdId),
        eq(schema.commonFundContributions.fundId, fund.id),
      ))
      .orderBy(asc(schema.commonFundContributions.createdAt));
    const expenses = await db.select({
      id: schema.commonExpenses.id,
      category: schema.commonExpenses.category,
      amountPaise: schema.commonExpenses.amountPaise,
      description: schema.commonExpenses.description,
      purchasedBy: schema.commonExpenses.purchasedBy,
      purchaserName: schema.users.name,
      purchasedAt: schema.commonExpenses.purchasedAt,
      receiptUrl: schema.commonExpenses.receiptUrl,
    })
      .from(schema.commonExpenses)
      .innerJoin(schema.users, eq(schema.users.id, schema.commonExpenses.purchasedBy))
      .where(and(
        eq(schema.commonExpenses.householdId, householdId),
        eq(schema.commonExpenses.fundId, fund.id),
      ))
      .orderBy(asc(schema.commonExpenses.purchasedAt));
    const members = await db.select({
      id: schema.users.id,
      name: schema.users.name,
    })
      .from(schema.householdMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.householdMembers.userId))
      .where(eq(schema.householdMembers.householdId, householdId));

    const collectedPaise = contributionTotals.amountPaise ?? 0;
    const spentPaise = expenseTotals.amountPaise ?? 0;
    return Response.json({
      period: { startsAt: fund.startsAt, endsAt: fund.endsAt },
      members,
      totals: { collectedPaise, spentPaise, balancePaise: collectedPaise - spentPaise },
      contributions,
      expenses,
    });
  } catch (error) {
    const response = authorizationResponse(error);
    if (response) return response;
    if (error instanceof AuthorizationError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to load common fund.", error);
    return Response.json({ error: "Unable to load common fund." }, { status: 500 });
  }
}
