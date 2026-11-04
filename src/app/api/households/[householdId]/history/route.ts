import { and, desc, eq, isNull } from "drizzle-orm";
import { NextRequest } from "next/server";
import { AuthorizationError, authorizationResponse, authorizeHouseholdAccess } from "@/lib/auth/authorize";
import { getDb, schema } from "@/lib/db";

export async function GET(_request: NextRequest, context: { params: Promise<unknown> }) {
  try {
    const params = await context.params;
    if (typeof params !== "object" || params === null || !("householdId" in params) || typeof params.householdId !== "string") {
      return Response.json({ error: "Group not found." }, { status: 404 });
    }
    const { householdId } = params;
    await authorizeHouseholdAccess(householdId);
    const db = getDb();

    const [household] = await db.select({
      id: schema.households.id,
      name: schema.households.name,
      createdBy: schema.households.createdBy,
      createdByName: schema.users.name,
    })
      .from(schema.households)
      .innerJoin(schema.users, eq(schema.users.id, schema.households.createdBy))
      .where(eq(schema.households.id, householdId))
      .limit(1);
    if (!household) return Response.json({ error: "Group not found." }, { status: 404 });

    const members = await db.select({
      id: schema.users.id,
      name: schema.users.name,
      role: schema.householdMembers.role,
    })
      .from(schema.householdMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.householdMembers.userId))
      .where(eq(schema.householdMembers.householdId, householdId));

    const meals = await db.select({
      id: schema.meals.id,
      name: schema.meals.name,
      category: schema.meals.category,
      totalPaise: schema.meals.totalPaise,
      description: schema.meals.description,
      eatenAt: schema.meals.eatenAt,
      cancelledAt: schema.meals.cancelledAt,
      payerName: schema.users.name,
    })
      .from(schema.meals)
      .innerJoin(schema.users, eq(schema.users.id, schema.meals.payerId))
      .where(and(
        eq(schema.meals.householdId, householdId),
        isNull(schema.meals.cancelledAt),
      ))
      .orderBy(desc(schema.meals.eatenAt))
      .limit(50);

    const contributions = await db.select({
      id: schema.commonFundContributions.id,
      name: schema.users.name,
      amountPaise: schema.commonFundContributions.amountPaise,
      createdAt: schema.commonFundContributions.createdAt,
      periodStartsAt: schema.monthlyPeriods.startsAt,
    })
      .from(schema.commonFundContributions)
      .innerJoin(schema.users, eq(schema.users.id, schema.commonFundContributions.memberId))
      .innerJoin(schema.commonFunds, and(
        eq(schema.commonFunds.householdId, schema.commonFundContributions.householdId),
        eq(schema.commonFunds.id, schema.commonFundContributions.fundId),
      ))
      .innerJoin(schema.monthlyPeriods, and(
        eq(schema.monthlyPeriods.householdId, schema.commonFunds.householdId),
        eq(schema.monthlyPeriods.id, schema.commonFunds.periodId),
      ))
      .where(eq(schema.commonFundContributions.householdId, householdId))
      .orderBy(desc(schema.commonFundContributions.createdAt))
      .limit(50);

    const expenses = await db.select({
      id: schema.commonExpenses.id,
      category: schema.commonExpenses.category,
      description: schema.commonExpenses.description,
      amountPaise: schema.commonExpenses.amountPaise,
      purchasedAt: schema.commonExpenses.purchasedAt,
      purchaserName: schema.users.name,
      periodStartsAt: schema.monthlyPeriods.startsAt,
    })
      .from(schema.commonExpenses)
      .innerJoin(schema.users, eq(schema.users.id, schema.commonExpenses.purchasedBy))
      .innerJoin(schema.commonFunds, and(
        eq(schema.commonFunds.householdId, schema.commonExpenses.householdId),
        eq(schema.commonFunds.id, schema.commonExpenses.fundId),
      ))
      .innerJoin(schema.monthlyPeriods, and(
        eq(schema.monthlyPeriods.householdId, schema.commonFunds.householdId),
        eq(schema.monthlyPeriods.id, schema.commonFunds.periodId),
      ))
      .where(eq(schema.commonExpenses.householdId, householdId))
      .orderBy(desc(schema.commonExpenses.purchasedAt))
      .limit(50);

    return Response.json({ household, members, meals, contributions, expenses });
  } catch (error) {
    const response = authorizationResponse(error);
    if (response) return response;
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Failed to load group history.", error);
    return Response.json({ error: "Unable to load group details and history." }, { status: 500 });
  }
}
