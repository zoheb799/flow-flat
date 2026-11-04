import { and, count, desc, eq, gte, inArray, isNull, sum } from "drizzle-orm";
import { AuthorizationError, authorizationResponse, authorizeHouseholdAccess } from "@/lib/auth/authorize";
import { getDb, schema } from "@/lib/db";
import { getOrCreateCurrentFund } from "@/lib/services/common-fund";

type RouteContext = { params: Promise<{ householdId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { householdId } = await params;
    const { user, role } = await authorizeHouseholdAccess(householdId);
    const db = getDb();

    const [household] = await db.select({
      id: schema.households.id,
      name: schema.households.name,
    }).from(schema.households).where(eq(schema.households.id, householdId)).limit(1);
    if (!household) {
      return Response.json({ error: "Household not found." }, { status: 404 });
    }

    const members = await db.select({
      id: schema.users.id,
      name: schema.users.name,
      balancePaise: schema.wallets.balancePaise,
      walletId: schema.wallets.id,
    })
      .from(schema.householdMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.householdMembers.userId))
      .leftJoin(schema.wallets, and(
        eq(schema.wallets.householdId, schema.householdMembers.householdId),
        eq(schema.wallets.memberId, schema.householdMembers.userId),
      ))
      .where(and(
        eq(schema.householdMembers.householdId, householdId),
        ...(role === "ADMIN" ? [] : [eq(schema.householdMembers.userId, user.id)]),
      ));

    const recentMeals = await db.select({
      id: schema.meals.id,
      name: schema.meals.name,
      totalPaise: schema.meals.totalPaise,
      eatenAt: schema.meals.eatenAt,
      participantCount: count(schema.mealParticipants.memberId),
    })
      .from(schema.meals)
      .leftJoin(schema.mealParticipants, and(
        eq(schema.mealParticipants.householdId, schema.meals.householdId),
        eq(schema.mealParticipants.mealId, schema.meals.id),
      ))
      .where(and(
        eq(schema.meals.householdId, householdId),
        isNull(schema.meals.cancelledAt),
      ))
      .groupBy(schema.meals.id)
      .orderBy(desc(schema.meals.eatenAt))
      .limit(5);

    const fund = await getOrCreateCurrentFund(householdId);
    const [contributions] = await db.select({
      totalPaise: sum(schema.commonFundContributions.amountPaise).mapWith(Number),
    })
      .from(schema.commonFundContributions)
      .where(and(
        eq(schema.commonFundContributions.householdId, householdId),
        eq(schema.commonFundContributions.fundId, fund.id),
      ));
    const [expenses] = await db.select({
      totalPaise: sum(schema.commonExpenses.amountPaise).mapWith(Number),
    })
      .from(schema.commonExpenses)
      .where(and(
        eq(schema.commonExpenses.householdId, householdId),
        eq(schema.commonExpenses.fundId, fund.id),
      ));

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const walletTransactions = await db.select({
      memberId: schema.walletTransactions.memberId,
      amountPaise: schema.walletTransactions.amountPaise,
      type: schema.walletTransactions.type,
    })
      .from(schema.walletTransactions)
      .where(and(
        eq(schema.walletTransactions.householdId, householdId),
        inArray(schema.walletTransactions.memberId, members.map((member) => member.id)),
        gte(schema.walletTransactions.createdAt, monthStart),
      ));
    const expenditureByMember = new Map<string, number>();
    for (const transaction of walletTransactions) {
      if (transaction.type === "MEAL_DEBIT") {
        expenditureByMember.set(
          transaction.memberId,
          (expenditureByMember.get(transaction.memberId) ?? 0) + transaction.amountPaise,
        );
      } else if (transaction.type === "MEAL_REFUND") {
        expenditureByMember.set(
          transaction.memberId,
          (expenditureByMember.get(transaction.memberId) ?? 0) - transaction.amountPaise,
        );
      }
    }

    return Response.json({
      household,
      role,
      members: members.map((member) => ({
        ...member,
        balancePaise: member.balancePaise ?? 0,
        monthlyExpenditurePaise: expenditureByMember.get(member.id) ?? 0,
      })),
      recentMeals,
      commonFund: {
        collectedPaise: contributions?.totalPaise ?? 0,
        spentPaise: expenses?.totalPaise ?? 0,
      },
    });
  } catch (error) {
    const response = authorizationResponse(error);
    if (response) return response;
    if (error instanceof AuthorizationError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to load dashboard.", error);
    return Response.json({ error: "Unable to load household dashboard." }, { status: 500 });
  }
}
