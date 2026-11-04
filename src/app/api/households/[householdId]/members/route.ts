import { eq } from "drizzle-orm";
import { z } from "zod";
import { AuthorizationError, authorizationResponse, authorizeHouseholdRole } from "@/lib/auth/authorize";
import { getDb, schema } from "@/lib/db";
import { normalizePhone } from "@/lib/validation/phone";
import { consumeRateLimit } from "@/lib/security/rate-limit";

const memberSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().min(8).max(20),
});
type RouteContext = { params: Promise<{ householdId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { householdId } = await params;
    const { user } = await authorizeHouseholdRole(householdId, ["ADMIN"]);
    const allowed = await consumeRateLimit("member-add", `${householdId}:${user.id}`, 30, 60 * 60 * 1000);
    if (!allowed) return Response.json({ error: "Too many member additions. Try again later." }, { status: 429 });

    const input = memberSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return Response.json({ error: "Enter a name and valid phone number." }, { status: 400 });
    const phone = normalizePhone(input.data.phone);
    if (!phone) return Response.json({ error: "Enter a valid phone number, including country code if needed." }, { status: 400 });

    const db = getDb();
    const result = await db.transaction(async (tx) => {
      let [member] = await tx.select({ id: schema.users.id, name: schema.users.name })
        .from(schema.users)
        .where(eq(schema.users.phone, phone))
        .limit(1);
      if (!member) {
        [member] = await tx.insert(schema.users).values({
          name: input.data.name,
          phone,
        }).onConflictDoNothing({ target: schema.users.phone })
          .returning({ id: schema.users.id, name: schema.users.name });
        if (!member) {
          [member] = await tx.select({ id: schema.users.id, name: schema.users.name })
            .from(schema.users)
            .where(eq(schema.users.phone, phone))
            .limit(1);
        }
      }
      if (!member) throw new Error("Unable to create or find the user account.");

      const [membership] = await tx.insert(schema.householdMembers).values({
        householdId,
        userId: member.id,
        role: "MEMBER",
      }).onConflictDoNothing().returning({ userId: schema.householdMembers.userId });
      if (!membership) throw new Error("This person is already a household member.");

      await tx.insert(schema.wallets).values({
        householdId,
        memberId: member.id,
      });
      await tx.insert(schema.notifications).values({
        householdId,
        userId: member.id,
        type: "MEMBER_ADDED",
        title: "You were added to a household",
        message: "Your household is ready to use.",
        href: "/dashboard",
      });
      await tx.insert(schema.auditLogs).values({
        householdId,
        actorId: user.id,
        action: "MEMBER_ADDED",
        resourceType: "USER",
        resourceId: member.id,
        details: {},
      });
      return member;
    });

    return Response.json(result, { status: 201 });
  } catch (error) {
    const response = authorizationResponse(error);
    if (response) return response;
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && /account found|already a household member/i.test(error.message)) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    console.error("Failed to add household member.", error);
    return Response.json({ error: "Unable to add household member." }, { status: 500 });
  }
}
