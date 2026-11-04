import { eq } from "drizzle-orm";
import { z } from "zod";
import { authorizationResponse, authorizeHouseholdAccess } from "@/lib/auth/authorize";
import { getDb, schema } from "@/lib/db";
import { consumeRateLimit } from "@/lib/security/rate-limit";

const subscriptionSchema = z.object({
  householdId: z.string().uuid(),
  subscription: z.object({
    endpoint: z.string().url().max(2048),
    keys: z.object({
      p256dh: z.string().min(1).max(256),
      auth: z.string().min(1).max(256),
    }),
    expirationTime: z.number().nullable().optional(),
  }),
});

export async function POST(request: Request) {
  try {
    const input = subscriptionSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return Response.json({ error: "Invalid push subscription." }, { status: 400 });
    const { user } = await authorizeHouseholdAccess(input.data.householdId);
    if (!await consumeRateLimit("push-subscription", `${input.data.householdId}:${user.id}`, 10, 60 * 60 * 1000)) {
      return Response.json({ error: "Too many subscription requests. Try again later." }, { status: 429 });
    }
    const db = getDb();
    const [existingOwner] = await db.select({ userId: schema.pushSubscriptions.userId })
      .from(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.endpoint, input.data.subscription.endpoint))
      .limit(1);
    if (existingOwner && existingOwner.userId !== user.id) {
      return Response.json({ error: "This device subscription is already associated with another account." }, { status: 409 });
    }
    await db.insert(schema.pushSubscriptions).values({
      householdId: input.data.householdId,
      userId: user.id,
      endpoint: input.data.subscription.endpoint,
      subscription: input.data.subscription,
    }).onConflictDoUpdate({
      target: [schema.pushSubscriptions.householdId, schema.pushSubscriptions.endpoint],
      set: {
        householdId: input.data.householdId,
        userId: user.id,
        subscription: input.data.subscription,
        updatedAt: new Date(),
      },
    });
    return Response.json({ saved: true }, { status: 201 });
  } catch (error) {
    const response = authorizationResponse(error);
    if (response) return response;
    console.error("Failed to save push subscription.", error);
    return Response.json({ error: "Unable to save push subscription." }, { status: 500 });
  }
}
