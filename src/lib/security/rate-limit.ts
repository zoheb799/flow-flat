import "server-only";
import { createHash } from "node:crypto";
import { lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export async function consumeRateLimit(
  scope: string,
  identifier: string,
  limit: number,
  windowMs: number,
) {
  const key = createHash("sha256").update(`${scope}:${identifier}`).digest("hex");
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);
  const [bucket] = await getDb().insert(schema.rateLimits).values({
    key,
    requestCount: 1,
    resetAt,
  }).onConflictDoUpdate({
    target: schema.rateLimits.key,
    set: {
      requestCount: sql`CASE WHEN ${schema.rateLimits.resetAt} <= ${sql.param(now, schema.rateLimits.resetAt)} THEN 1 ELSE ${schema.rateLimits.requestCount} + 1 END`,
      resetAt: sql`CASE WHEN ${schema.rateLimits.resetAt} <= ${sql.param(now, schema.rateLimits.resetAt)} THEN ${sql.param(resetAt, schema.rateLimits.resetAt)} ELSE ${schema.rateLimits.resetAt} END`,
    },
  }).returning({ requestCount: schema.rateLimits.requestCount });

  if (bucket.requestCount % 100 === 0) {
    await getDb().delete(schema.rateLimits).where(lt(schema.rateLimits.resetAt, now));
  }
  return bucket.requestCount <= limit;
}

export function getClientAddress(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || headers.get("x-real-ip")
    || "unknown";
}
