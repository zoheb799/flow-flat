import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { AuthorizationError, authorizationResponse, authorizeHouseholdRole } from "@/lib/auth/authorize";
import { getDb, schema } from "@/lib/db";
import { consumeRateLimit } from "@/lib/security/rate-limit";

const inviteSchema = z.object({ email: z.string().trim().email().max(254) });
type RouteContext = { params: Promise<{ householdId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { householdId } = await params;
    const { user } = await authorizeHouseholdRole(householdId, ["ADMIN"]);
    const allowed = await consumeRateLimit("invite", `${householdId}:${user.id}`, 20, 60 * 60 * 1000);
    if (!allowed) return Response.json({ error: "Too many invitations. Try again later." }, { status: 429 });
    const input = inviteSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const email = input.data.email.toLowerCase();
    const db = getDb();
    const [existingMember] = await db.select({ userId: schema.householdMembers.userId })
      .from(schema.householdMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.householdMembers.userId))
      .where(and(
        eq(schema.householdMembers.householdId, householdId),
        eq(schema.users.email, email),
      ))
      .limit(1);
    if (existingMember) {
      return Response.json({ error: "This person is already a household member." }, { status: 409 });
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await db.insert(schema.invitations).values({
      householdId,
      email,
      tokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdBy: user.id,
    });

    const origin = new URL(request.url).origin;
    return Response.json({
      invitationUrl: `${origin}/invitations/accept?token=${encodeURIComponent(token)}`,
      expiresInDays: 7,
    }, { status: 201 });
  } catch (error) {
    const response = authorizationResponse(error);
    if (response) return response;
    if (error instanceof AuthorizationError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to create household invitation.", error);
    return Response.json({ error: "Unable to create invitation." }, { status: 500 });
  }
}
