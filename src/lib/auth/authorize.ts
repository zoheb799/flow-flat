import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { auth } from "@/auth";

export class AuthorizationError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403 | 404 = 403,
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AuthorizationError("Authentication required.", 401);
  }
  return { id: session.user.id, name: session.user.name ?? "Member" };
}

export async function authorizeHouseholdAccess(householdId: string) {
  if (!isUuid(householdId)) {
    throw new AuthorizationError("Household not found.", 404);
  }
  const user = await requireUser();
  const [membership] = await getDb()
    .select({ role: schema.householdMembers.role })
    .from(schema.householdMembers)
    .where(
      and(
        eq(schema.householdMembers.householdId, householdId),
        eq(schema.householdMembers.userId, user.id),
      ),
    )
    .limit(1);

  if (!membership) {
    throw new AuthorizationError("Household not found.", 404);
  }

  function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  return { user, role: membership.role };
}

export async function authorizeHouseholdRole(
  householdId: string,
  roles: Array<"ADMIN" | "MEMBER">,
) {
  const access = await authorizeHouseholdAccess(householdId);
  if (!roles.includes(access.role)) {
    throw new AuthorizationError("You do not have permission to do that.", 403);
  }
  return access;
}

export function authorizationResponse(error: unknown) {
  if (error instanceof AuthorizationError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return null;
}
