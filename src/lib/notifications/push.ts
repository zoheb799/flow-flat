import "server-only";
import webpush from "web-push";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

type PushPayload = { title: string; body: string; url: string };

export async function sendHouseholdPush(
  householdId: string,
  userIds: string[],
  payloadFor: (userId: string) => PushPayload,
) {
  if (!userIds.length) return;
  try {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    if (!publicKey || !privateKey || !subject) {
      console.warn("Web Push is not configured; in-app notifications remain available.");
      return;
    }
    webpush.setVapidDetails(subject, publicKey, privateKey);
    const subscriptions = await getDb().select({
      id: schema.pushSubscriptions.id,
      userId: schema.pushSubscriptions.userId,
      subscription: schema.pushSubscriptions.subscription,
    })
      .from(schema.pushSubscriptions)
      .where(and(
        eq(schema.pushSubscriptions.householdId, householdId),
        inArray(schema.pushSubscriptions.userId, [...new Set(userIds)]),
      ));

    await Promise.all(subscriptions.map(async (item) => {
      try {
      await webpush.sendNotification(
        item.subscription as webpush.PushSubscription,
        JSON.stringify(payloadFor(item.userId)),
      );
      } catch (error) {
        const statusCode = typeof error === "object" && error !== null && "statusCode" in error
          ? Number(error.statusCode)
          : undefined;
        if (statusCode === 404 || statusCode === 410) {
          try {
            await getDb().delete(schema.pushSubscriptions)
              .where(eq(schema.pushSubscriptions.id, item.id));
          } catch (cleanupError) {
            console.error("Could not remove expired push subscription.", cleanupError);
          }
          return;
        }
        console.error("Web Push delivery failed; in-app notification is retained.", error);
      }
    }));
  } catch (error) {
    console.error("Could not dispatch Web Push; in-app notification is retained.", error);
  }
}
