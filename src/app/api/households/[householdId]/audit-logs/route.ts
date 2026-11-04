import { desc, eq } from "drizzle-orm";
import { AuthorizationError, authorizationResponse, authorizeHouseholdRole } from "@/lib/auth/authorize";
import { getDb, schema } from "@/lib/db";

type RouteContext = { params: Promise<{ householdId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { householdId } = await params;
    await authorizeHouseholdRole(householdId, ["ADMIN"]);
    const entries = await getDb().select({
      id: schema.auditLogs.id,
      action: schema.auditLogs.action,
      resourceType: schema.auditLogs.resourceType,
      resourceId: schema.auditLogs.resourceId,
      details: schema.auditLogs.details,
      createdAt: schema.auditLogs.createdAt,
      actorId: schema.auditLogs.actorId,
      actorName: schema.users.name,
    })
      .from(schema.auditLogs)
      .innerJoin(schema.users, eq(schema.users.id, schema.auditLogs.actorId))
      .where(eq(schema.auditLogs.householdId, householdId))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(200);
    return Response.json(entries);
  } catch (error) {
    const response = authorizationResponse(error);
    if (response) return response;
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Failed to load audit log.", error);
    return Response.json({ error: "Unable to load audit log." }, { status: 500 });
  }
}
