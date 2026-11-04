import { and, eq, sql } from "drizzle-orm";
import { ZodError } from "zod";
import { AuthorizationError, authorizationResponse, authorizeHouseholdRole } from "@/lib/auth/authorize";
import { getDb, schema } from "@/lib/db";
import { getOrCreateCurrentFund } from "@/lib/services/common-fund";
import { commonContributionSchema } from "@/lib/validation/common-fund";
import { consumeRateLimit } from "@/lib/security/rate-limit";

type RouteContext = { params: Promise<{ householdId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { householdId } = await params;
    const { user } = await authorizeHouseholdRole(householdId, ["ADMIN"]);
    const allowed = await consumeRateLimit("ration-contribution", `${householdId}:${user.id}`, 40, 60 * 60 * 1000);
    if (!allowed) return Response.json({ error: "Too many contribution attempts. Try again later." }, { status: 429 });
    const input = commonContributionSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return Response.json({ error: "Invalid ration contribution details.", issues: input.error.issues }, { status: 400 });

    const fund = await getOrCreateCurrentFund(householdId);
    const result = await getDb().transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${householdId}), hashtext(${input.data.idempotencyKey}))`);
      const [existing] = await tx.select({ id: schema.commonFundContributions.id })
        .from(schema.commonFundContributions)
        .where(and(
          eq(schema.commonFundContributions.householdId, householdId),
          eq(schema.commonFundContributions.idempotencyKey, input.data.idempotencyKey),
        ))
        .limit(1);
      if (existing) return existing;

      const [lockedFund] = await tx.select({ id: schema.commonFunds.id })
        .from(schema.commonFunds)
        .where(and(
          eq(schema.commonFunds.householdId, householdId),
          eq(schema.commonFunds.id, fund.id),
        ))
        .for("update");
      if (!lockedFund) throw new Error("Common ration fund not found.");
      const [member] = await tx.select({ userId: schema.householdMembers.userId })
        .from(schema.householdMembers)
        .where(and(
          eq(schema.householdMembers.householdId, householdId),
          eq(schema.householdMembers.userId, input.data.memberId),
        ))
        .limit(1);
      if (!member) throw new Error("Member not found in this household.");
      const [total] = await tx.select({
        amountPaise: sql<number>`COALESCE(SUM(${schema.commonFundContributions.amountPaise}), 0)`.mapWith(Number),
      }).from(schema.commonFundContributions)
        .where(and(
          eq(schema.commonFundContributions.householdId, householdId),
          eq(schema.commonFundContributions.fundId, fund.id),
        ));
      if (total.amountPaise + input.data.amountPaise > Number.MAX_SAFE_INTEGER) {
        throw new Error("Contribution would exceed the maximum supported fund balance.");
      }

      const [contribution] = await tx.insert(schema.commonFundContributions).values({
        householdId,
        fundId: fund.id,
        memberId: input.data.memberId,
        amountPaise: input.data.amountPaise,
        idempotencyKey: input.data.idempotencyKey,
        createdBy: user.id,
      }).returning({ id: schema.commonFundContributions.id });
      await tx.insert(schema.notifications).values({
        householdId,
        userId: input.data.memberId,
        type: "RATION_CONTRIBUTION",
        title: "Common ration contribution recorded",
        message: `₹${(input.data.amountPaise / 100).toFixed(2)} added to the common fund.`,
        href: "/ration",
      });
      await tx.insert(schema.auditLogs).values({
        householdId,
        actorId: user.id,
        action: "RATION_CONTRIBUTION",
        resourceType: "COMMON_FUND_CONTRIBUTION",
        resourceId: contribution.id,
        details: { memberId: input.data.memberId, amountPaise: input.data.amountPaise },
      });
      return contribution;
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    const response = authorizationResponse(error);
    if (response) return response;
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof ZodError) return Response.json({ error: "Invalid ration contribution." }, { status: 400 });
    if (error instanceof Error && /fund|member/i.test(error.message)) return Response.json({ error: error.message }, { status: 409 });
    console.error("Failed to record ration contribution.", error);
    return Response.json({ error: "Unable to record ration contribution." }, { status: 500 });
  }
}
