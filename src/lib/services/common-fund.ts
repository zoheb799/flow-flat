import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export async function getOrCreateCurrentFund(householdId: string) {
  const now = new Date();
  const startsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const endsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${householdId}), hashtext(${startsAt.toISOString()}))`);
    let [period] = await tx.select({ id: schema.monthlyPeriods.id })
      .from(schema.monthlyPeriods)
      .where(and(
        eq(schema.monthlyPeriods.householdId, householdId),
        eq(schema.monthlyPeriods.startsAt, startsAt),
      ))
      .limit(1);
    if (!period) {
      [period] = await tx.insert(schema.monthlyPeriods).values({
        householdId,
        startsAt,
        endsAt,
      }).returning({ id: schema.monthlyPeriods.id });
    }

    let [fund] = await tx.select({ id: schema.commonFunds.id })
      .from(schema.commonFunds)
      .where(and(
        eq(schema.commonFunds.householdId, householdId),
        eq(schema.commonFunds.periodId, period.id),
      ))
      .limit(1);
    if (!fund) {
      [fund] = await tx.insert(schema.commonFunds).values({
        householdId,
        periodId: period.id,
      }).returning({ id: schema.commonFunds.id });
    }
    return { ...fund, periodId: period.id, startsAt, endsAt };
  });
}
