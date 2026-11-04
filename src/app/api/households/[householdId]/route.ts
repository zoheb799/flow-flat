import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";
import { AuthorizationError, authorizationResponse, authorizeHouseholdRole } from "@/lib/auth/authorize";
import { getDb, schema } from "@/lib/db";

const updateSchema = z.object({ name: z.string().trim().min(2).max(80) });
export async function PATCH(request: NextRequest, context: { params: Promise<unknown> }) {
 try {
   const params = await context.params;
   if (typeof params !== "object" || params === null || !("householdId" in params) || typeof params.householdId !== "string") {
     return Response.json({ error: "Group not found." }, { status: 404 });
   }
   const { householdId } = params;
    const { user } = await authorizeHouseholdRole(householdId, ["ADMIN"]);
    const input = updateSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return Response.json({ error: "Group name must be between 2 and 80 characters." }, { status: 400 });

    const db = getDb();
    const household = await db.transaction(async (tx) => {
      const [updated] = await tx.update(schema.households)
        .set({ name: input.data.name, updatedAt: new Date() })
        .where(eq(schema.households.id, householdId))
        .returning({ id: schema.households.id, name: schema.households.name, createdBy: schema.households.createdBy });
      if (!updated) throw new Error("Group not found.");
      if (updated.createdBy !== user.id) throw new AuthorizationError("Only the group creator can edit its details.", 403);
      await tx.insert(schema.auditLogs).values({
        householdId,
        actorId: user.id,
        action: "HOUSEHOLD_UPDATED",
        resourceType: "HOUSEHOLD",
        resourceId: householdId,
        details: { name: input.data.name },
      });
      return updated;
    });
    return Response.json(household);
  } catch (error) {
    const response = authorizationResponse(error);
    if (response) return response;
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Failed to update household.", error);
    return Response.json({ error: "Unable to update group details." }, { status: 500 });
  }
}
