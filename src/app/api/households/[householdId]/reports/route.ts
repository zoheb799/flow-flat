import { and, eq, gte, isNull, lt, sum } from "drizzle-orm";
import { AuthorizationError, authorizationResponse, authorizeHouseholdAccess } from "@/lib/auth/authorize";
import { getDb, schema } from "@/lib/db";

type RouteContext = { params: Promise<{ householdId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { householdId } = await params;
    const { user, role } = await authorizeHouseholdAccess(householdId);
    const month = new URL(request.url).searchParams.get("month");
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return Response.json({ error: "Select a valid report month." }, { status: 400 });
    }

    const [year, monthNumber] = month.split("-").map(Number);
    const startsAt = new Date(Date.UTC(year, monthNumber - 1, 1));
    const endsAt = new Date(Date.UTC(year, monthNumber, 1));
    const db = getDb();
    const memberFilter = role === "ADMIN" ? undefined : eq(schema.walletTransactions.memberId, user.id);
    const householdMembers = await db.select({
      memberId: schema.users.id,
      name: schema.users.name,
    })
      .from(schema.householdMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.householdMembers.userId))
      .where(and(
        eq(schema.householdMembers.householdId, householdId),
        ...(role === "ADMIN" ? [] : [eq(schema.householdMembers.userId, user.id)]),
      ));
    const transactions = await db.select({
      memberId: schema.walletTransactions.memberId,
      memberName: schema.users.name,
      type: schema.walletTransactions.type,
      amountPaise: schema.walletTransactions.amountPaise,
    })
      .from(schema.walletTransactions)
      .innerJoin(schema.users, eq(schema.users.id, schema.walletTransactions.memberId))
      .where(and(
        eq(schema.walletTransactions.householdId, householdId),
        gte(schema.walletTransactions.createdAt, startsAt),
        lt(schema.walletTransactions.createdAt, endsAt),
        memberFilter,
      ));

    const memberMap = new Map<string, {
      memberId: string;
      name: string;
      contributionsPaise: number;
      mealSpentPaise: number;
      transactionCount: number;
    }>(householdMembers.map((member) => [member.memberId, {
      ...member,
      contributionsPaise: 0,
      mealSpentPaise: 0,
      transactionCount: 0,
    }]));
    for (const transaction of transactions) {
      const current = memberMap.get(transaction.memberId);
      if (!current) continue;
      if (transaction.type === "CONTRIBUTION") current.contributionsPaise += transaction.amountPaise;
      if (transaction.type === "MEAL_DEBIT") current.mealSpentPaise += transaction.amountPaise;
      if (transaction.type === "MEAL_REFUND") current.mealSpentPaise -= transaction.amountPaise;
      current.transactionCount += 1;
      memberMap.set(transaction.memberId, current);
    }

    const meals = await db.select({
      id: schema.meals.id,
      totalPaise: schema.meals.totalPaise,
      category: schema.meals.category,
    })
      .from(schema.meals)
      .where(and(
        eq(schema.meals.householdId, householdId),
        gte(schema.meals.eatenAt, startsAt),
        lt(schema.meals.eatenAt, endsAt),
        isNull(schema.meals.cancelledAt),
      ));

    const [period] = await db.select({ id: schema.monthlyPeriods.id })
      .from(schema.monthlyPeriods)
      .where(and(
        eq(schema.monthlyPeriods.householdId, householdId),
        eq(schema.monthlyPeriods.startsAt, startsAt),
      ))
      .limit(1);
    let rationCollectedPaise = 0;
    let rationSpentPaise = 0;
    if (period) {
      const [fund] = await db.select({ id: schema.commonFunds.id })
        .from(schema.commonFunds)
        .where(and(
          eq(schema.commonFunds.householdId, householdId),
          eq(schema.commonFunds.periodId, period.id),
        ))
        .limit(1);
      if (fund) {
        const [collected] = await db.select({
          amountPaise: sum(schema.commonFundContributions.amountPaise).mapWith(Number),
        }).from(schema.commonFundContributions).where(and(
          eq(schema.commonFundContributions.householdId, householdId),
          eq(schema.commonFundContributions.fundId, fund.id),
        ));
        const [spent] = await db.select({
          amountPaise: sum(schema.commonExpenses.amountPaise).mapWith(Number),
        }).from(schema.commonExpenses).where(and(
          eq(schema.commonExpenses.householdId, householdId),
          eq(schema.commonExpenses.fundId, fund.id),
        ));
        rationCollectedPaise = collected.amountPaise ?? 0;
        rationSpentPaise = spent.amountPaise ?? 0;
      }
    }

    return Response.json({
      month,
      role,
      members: [...memberMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
      totals: {
        walletContributionsPaise: [...memberMap.values()].reduce((total, member) => total + member.contributionsPaise, 0),
        mealSpentPaise: [...memberMap.values()].reduce((total, member) => total + member.mealSpentPaise, 0),
        rationCollectedPaise,
        rationSpentPaise,
        mealCount: meals.length,
        mealTotalPaise: meals.reduce((total, meal) => total + meal.totalPaise, 0),
      },
      meals,
    });
  } catch (error) {
    const response = authorizationResponse(error);
    if (response) return response;
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Failed to generate monthly report.", error);
    return Response.json({ error: "Unable to generate report." }, { status: 500 });
  }
}
