import { and, eq, sql, sum } from "drizzle-orm";
import { ZodError } from "zod";
import { AuthorizationError, authorizationResponse, authorizeHouseholdRole } from "@/lib/auth/authorize";
import { getDb, schema } from "@/lib/db";
import { getOrCreateCurrentFund } from "@/lib/services/common-fund";
import { commonExpenseSchema } from "@/lib/validation/common-fund";
import { consumeRateLimit } from "@/lib/security/rate-limit";

type RouteContext = { params: Promise<{ householdId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { householdId } = await params;
    const { user } = await authorizeHouseholdRole(householdId, ["ADMIN"]);
    const allowed = await consumeRateLimit("ration-expense", `${householdId}:${user.id}`, 40, 60 * 60 * 1000);
    if (!allowed) return Response.json({ error: "Too many purchase attempts. Try again later." }, { status: 429 });
    const input = commonExpenseSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return Response.json({ error: "Invalid ration purchase details.", issues: input.error.issues }, { status: 400 });

    const fund = await getOrCreateCurrentFund(householdId);
    const result = await getDb().transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${householdId}), hashtext(${input.data.idempotencyKey}))`);
      const [existing] = await tx.select({ id: schema.commonExpenses.id })
        .from(schema.commonExpenses)
        .where(and(
          eq(schema.commonExpenses.householdId, householdId),
          eq(schema.commonExpenses.idempotencyKey, input.data.idempotencyKey),
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
      const [purchaser] = await tx.select({ userId: schema.householdMembers.userId })
        .from(schema.householdMembers)
        .where(and(
          eq(schema.householdMembers.householdId, householdId),
          eq(schema.householdMembers.userId, input.data.purchasedBy),
        ))
        .limit(1);
      if (!purchaser) throw new Error("Purchaser not found in this household.");

      const [contributions] = await tx.select({
        amountPaise: sum(schema.commonFundContributions.amountPaise).mapWith(Number),
      }).from(schema.commonFundContributions)
        .where(and(
          eq(schema.commonFundContributions.householdId, householdId),
          eq(schema.commonFundContributions.fundId, fund.id),
        ));
      const [expenses] = await tx.select({
        amountPaise: sum(schema.commonExpenses.amountPaise).mapWith(Number),
      }).from(schema.commonExpenses)
        .where(and(
          eq(schema.commonExpenses.householdId, householdId),
          eq(schema.commonExpenses.fundId, fund.id),
        ));
      if ((contributions.amountPaise ?? 0) - (expenses.amountPaise ?? 0) < input.data.amountPaise) {
        throw new Error("The common ration fund does not have enough balance.");
      }

      const [expense] = await tx.insert(schema.commonExpenses).values({
        householdId,
        fundId: fund.id,
        category: input.data.category,
        amountPaise: input.data.amountPaise,
        idempotencyKey: input.data.idempotencyKey,
        description: input.data.description,
        purchasedBy: input.data.purchasedBy,
        receiptUrl: input.data.receiptUrl,
        purchasedAt: new Date(input.data.purchasedAt),
        createdBy: user.id,
      }).returning({ id: schema.commonExpenses.id });

      const recipients = await tx.select({ userId: schema.householdMembers.userId })
        .from(schema.householdMembers)
        .where(eq(schema.householdMembers.householdId, householdId));
      await tx.insert(schema.notifications).values(recipients.map(({ userId }) => ({
        householdId,
        userId,
        type: "RATION_PURCHASE",
        title: "Ration purchase recorded",
        message: `${input.data.description} · ₹${(input.data.amountPaise / 100).toFixed(2)}.`,
        href: "/ration",
      })));
      await tx.insert(schema.auditLogs).values({
        householdId,
        actorId: user.id,
        action: "RATION_EXPENSE_RECORDED",
        resourceType: "COMMON_EXPENSE",
        resourceId: expense.id,
        details: { amountPaise: input.data.amountPaise, category: input.data.category },
      });
      return expense;
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    const response = authorizationResponse(error);
    if (response) return response;
    if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof ZodError) return Response.json({ error: "Invalid ration expense." }, { status: 400 });
    if (error instanceof Error && /balance|fund|purchaser/i.test(error.message)) return Response.json({ error: error.message }, { status: 409 });
    console.error("Failed to record ration expense.", error);
    return Response.json({ error: "Unable to record ration expense." }, { status: 500 });
  }
}
