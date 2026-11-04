import { and, eq } from "drizzle-orm";
import { AuthorizationError, authorizationResponse, authorizeHouseholdAccess } from "@/lib/auth/authorize";
import { getDb, schema } from "@/lib/db";

type RouteContext = { params: Promise<{ mealId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { mealId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(mealId)) {
    return Response.json({ error: "Meal not found." }, { status: 404 });
  }
  try {
    const [mealRef] = await getDb().select({
      householdId: schema.meals.householdId,
    }).from(schema.meals).where(eq(schema.meals.id, mealId)).limit(1);
    if (!mealRef) return Response.json({ error: "Meal not found." }, { status: 404 });

    const { user, role } = await authorizeHouseholdAccess(mealRef.householdId);
    const [meal] = await getDb().select({
      id: schema.meals.id,
      householdId: schema.meals.householdId,
      name: schema.meals.name,
      category: schema.meals.category,
      totalPaise: schema.meals.totalPaise,
      description: schema.meals.description,
      eatenAt: schema.meals.eatenAt,
      cancelledAt: schema.meals.cancelledAt,
      payerId: schema.meals.payerId,
      payerName: schema.users.name,
      createdBy: schema.meals.createdBy,
    })
      .from(schema.meals)
      .innerJoin(schema.users, eq(schema.users.id, schema.meals.payerId))
      .where(and(
        eq(schema.meals.householdId, mealRef.householdId),
        eq(schema.meals.id, mealId),
      ))
      .limit(1);
    const participants = await getDb().select({
      memberId: schema.mealParticipants.memberId,
      name: schema.users.name,
      sharePaise: schema.mealParticipants.sharePaise,
    })
      .from(schema.mealParticipants)
      .innerJoin(schema.users, eq(schema.users.id, schema.mealParticipants.memberId))
      .where(and(
        eq(schema.mealParticipants.householdId, mealRef.householdId),
        eq(schema.mealParticipants.mealId, mealId),
      ));
    return Response.json({ meal, participants, role, currentUserId: user.id });
  } catch (error) {
    const response = authorizationResponse(error);
    if (response) return response;
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Failed to load meal details.", error);
    return Response.json({ error: "Unable to load meal details." }, { status: 500 });
  }
}
