import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { authorizationResponse, authorizeHouseholdAccess } from "@/lib/auth/authorize";
import { getDb, schema } from "@/lib/db";

type RouteContext = { params: Promise<{ householdId: string }> };
const readSchema = z.object({ notificationId: z.string().uuid() });

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { householdId } = await params;
    const { user } = await authorizeHouseholdAccess(householdId);
    const notifications = await getDb().select({
      id: schema.notifications.id,
      type: schema.notifications.type,
      title: schema.notifications.title,
      message: schema.notifications.message,
      href: schema.notifications.href,
      readAt: schema.notifications.readAt,
      createdAt: schema.notifications.createdAt,
    })
      .from(schema.notifications)
      .where(and(
        eq(schema.notifications.householdId, householdId),
        eq(schema.notifications.userId, user.id),
      ))
      .orderBy(desc(schema.notifications.createdAt))
      .limit(100);
    return Response.json(notifications);
  } catch (error) {
    const response = authorizationResponse(error);
    if (response) return response;
    console.error("Failed to load notifications.", error);
    return Response.json({ error: "Unable to load notifications." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { householdId } = await params;
    const { user } = await authorizeHouseholdAccess(householdId);
    const input = readSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return Response.json({ error: "Invalid notification." }, { status: 400 });
    const [notification] = await getDb().update(schema.notifications)
      .set({ readAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(schema.notifications.householdId, householdId),
        eq(schema.notifications.userId, user.id),
        eq(schema.notifications.id, input.data.notificationId),
        isNull(schema.notifications.readAt),
      ))
      .returning({ id: schema.notifications.id });
    if (!notification) return Response.json({ error: "Notification not found or already read." }, { status: 404 });
    return Response.json({ id: notification.id, read: true });
  } catch (error) {
    const response = authorizationResponse(error);
    if (response) return response;
    console.error("Failed to mark notification read.", error);
    return Response.json({ error: "Unable to update notification." }, { status: 500 });
  }
}
