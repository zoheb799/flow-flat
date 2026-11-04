import { createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { AuthorizationError, authorizationResponse, requireUser } from "@/lib/auth/authorize";
import { getDb, schema } from "@/lib/db";

const acceptSchema = z.object({ token: z.string().min(32).max(128) });

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = acceptSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return Response.json({ error: "Invitation link is invalid or expired." }, { status: 400 });

    const tokenHash = createHash("sha256").update(input.data.token).digest("hex");
    const db = getDb();
    const result = await db.transaction(async (tx) => {
      const [invitation] = await tx.select({
        id: schema.invitations.id,
        householdId: schema.invitations.householdId,
        email: schema.invitations.email,
      })
        .from(schema.invitations)
        .where(and(
          eq(schema.invitations.tokenHash, tokenHash),
          isNull(schema.invitations.acceptedAt),
          gt(schema.invitations.expiresAt, new Date()),
        ))
        .for("update");
      if (!invitation) throw new Error("Invitation link is invalid or expired.");

      const [account] = await tx.select({ email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, user.id))
        .limit(1);
      if (!account || account.email !== invitation.email) {
        throw new Error("Sign in with the email address this invitation was sent to.");
      }

      await tx.insert(schema.householdMembers).values({
        householdId: invitation.householdId,
        userId: user.id,
        role: "MEMBER",
      }).onConflictDoNothing();
      await tx.insert(schema.wallets).values({
        householdId: invitation.householdId,
        memberId: user.id,
      }).onConflictDoNothing();
      await tx.update(schema.invitations)
        .set({ acceptedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.invitations.id, invitation.id));
      await tx.insert(schema.notifications).values({
        householdId: invitation.householdId,
        userId: user.id,
        type: "MEMBER_ADDED",
        title: "Welcome to your household",
        message: "Your FlatFlow household is ready.",
        href: "/dashboard",
      });
      await tx.insert(schema.auditLogs).values({
        householdId: invitation.householdId,
        actorId: user.id,
        action: "INVITATION_ACCEPTED",
        resourceType: "INVITATION",
        resourceId: invitation.id,
        details: {},
      });
      return { householdId: invitation.householdId };
    });
    return Response.json(result);
  } catch (error) {
    const response = authorizationResponse(error);
    if (response) return response;
    if (error instanceof AuthorizationError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && /invitation|email address/i.test(error.message)) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("Failed to accept invitation.", error);
    return Response.json({ error: "Unable to accept invitation." }, { status: 500 });
  }
}
