import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { AuthorizationError, authorizationResponse, requireUser } from "@/lib/auth/authorize";
import { getDb, schema } from "@/lib/db";

const householdSchema = z.object({ name: z.string().trim().min(2).max(80) });

export async function GET() {
  try {
    const user = await requireUser();
    const households = await getDb()
      .select({
        id: schema.households.id,
        name: schema.households.name,
        role: schema.householdMembers.role,
        createdBy: schema.households.createdBy,
        createdByName: schema.users.name,
      })
      .from(schema.householdMembers)
      .innerJoin(schema.households, eq(schema.households.id, schema.householdMembers.householdId))
      .innerJoin(schema.users, eq(schema.users.id, schema.households.createdBy))
      .where(eq(schema.householdMembers.userId, user.id))
      .orderBy(desc(schema.households.createdAt));
    if (!households.length) return Response.json([]);

    const members = await getDb()
      .select({
        householdId: schema.householdMembers.householdId,
        id: schema.users.id,
        name: schema.users.name,
      })
      .from(schema.householdMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.householdMembers.userId))
      .where(inArray(schema.householdMembers.householdId, households.map(({ id }) => id)));
    const membersByHousehold = new Map<string, Array<{ id: string; name: string }>>();
    for (const member of members) {
      const groupMembers = membersByHousehold.get(member.householdId) ?? [];
      groupMembers.push({ id: member.id, name: member.name });
      membersByHousehold.set(member.householdId, groupMembers);
    }

    return Response.json(households.map((household) => ({
      ...household,
      createdByMe: household.createdBy === user.id,
      members: membersByHousehold.get(household.id) ?? [],
    })));
  } catch (error) {
    const response = authorizationResponse(error);
    if (response) return response;
    console.error("Failed to load households.", error);
    return Response.json({ error: "Unable to load households." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = householdSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) {
      return Response.json({ error: "Household name must be between 2 and 80 characters." }, { status: 400 });
    }

    const db = getDb();
    const household = await db.transaction(async (tx) => {
      const [created] = await tx.insert(schema.households).values({
        name: input.data.name,
        createdBy: user.id,
      }).returning({ id: schema.households.id, name: schema.households.name });

      await tx.insert(schema.householdMembers).values({
        householdId: created.id,
        userId: user.id,
        role: "ADMIN",
      });

      await tx.insert(schema.wallets).values({
        householdId: created.id,
        memberId: user.id,
      });

      const now = new Date();
      const startsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const endsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      const [period] = await tx.insert(schema.monthlyPeriods).values({
        householdId: created.id,
        startsAt,
        endsAt,
      }).returning({ id: schema.monthlyPeriods.id });

      await tx.insert(schema.commonFunds).values({
        householdId: created.id,
        periodId: period.id,
      });

      await tx.insert(schema.auditLogs).values({
        householdId: created.id,
        actorId: user.id,
        action: "HOUSEHOLD_CREATED",
        resourceType: "HOUSEHOLD",
        resourceId: created.id,
        details: {},
      });
      return created;
    });

    return Response.json(household, { status: 201 });
  } catch (error) {
    const response = authorizationResponse(error);
    if (response) return response;
    if (error instanceof AuthorizationError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to create household.", error);
    return Response.json({ error: "Unable to create household." }, { status: 500 });
  }
}
