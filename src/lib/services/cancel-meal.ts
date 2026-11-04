import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { authorizeHouseholdRole } from "@/lib/auth/authorize";
import { getDb, schema } from "@/lib/db";
import { z } from "zod";
import { consumeRateLimit } from "@/lib/security/rate-limit";

const cancellationSchema = z.object({
  householdId: z.string().uuid(),
  mealId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
});

export async function cancelMeal(rawInput: unknown) {
  const input = cancellationSchema.parse(rawInput);
  const { user } = await authorizeHouseholdRole(input.householdId, ["ADMIN"]);
  if (!await consumeRateLimit("meal-cancel", `${input.householdId}:${user.id}`, 20, 60 * 60 * 1000)) {
    throw new Error("Too many cancellation requests. Try again later.");
  }
  const db = getDb();

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.householdId}), hashtext(${input.idempotencyKey}))`);
    const [meal] = await tx.select({
      id: schema.meals.id,
      cancelledAt: schema.meals.cancelledAt,
    })
      .from(schema.meals)
      .where(and(
        eq(schema.meals.householdId, input.householdId),
        eq(schema.meals.id, input.mealId),
      ))
      .for("update");
    if (!meal) throw new Error("Meal not found.");
    if (meal.cancelledAt) return { id: meal.id, alreadyCancelled: true };

    const participants = await tx.select({
      memberId: schema.mealParticipants.memberId,
      sharePaise: schema.mealParticipants.sharePaise,
    })
      .from(schema.mealParticipants)
      .where(and(
        eq(schema.mealParticipants.householdId, input.householdId),
        eq(schema.mealParticipants.mealId, meal.id),
      ))
      .orderBy(schema.mealParticipants.memberId);

    const wallets = await tx.select({
      id: schema.wallets.id,
      memberId: schema.wallets.memberId,
      balancePaise: schema.wallets.balancePaise,
    })
      .from(schema.wallets)
      .where(and(
        eq(schema.wallets.householdId, input.householdId),
        inArray(schema.wallets.memberId, participants.map(({ memberId }) => memberId)),
      ))
      .orderBy(schema.wallets.memberId)
      .for("update");
    const walletByMember = new Map(wallets.map((wallet) => [wallet.memberId, wallet]));
    if (walletByMember.size !== participants.length) {
      throw new Error("A participant wallet is no longer available.");
    }

    const cancelledAt = new Date();
    await tx.update(schema.meals)
      .set({ cancelledAt, updatedAt: cancelledAt })
      .where(eq(schema.meals.id, meal.id));

    for (const participant of participants) {
      const wallet = walletByMember.get(participant.memberId)!;
      if (wallet.balancePaise + participant.sharePaise > Number.MAX_SAFE_INTEGER) {
        throw new Error("Refund would exceed the maximum supported wallet balance.");
      }
      await tx.update(schema.wallets)
        .set({
          balancePaise: sql`${schema.wallets.balancePaise} + ${participant.sharePaise}`,
          updatedAt: cancelledAt,
        })
        .where(eq(schema.wallets.id, wallet.id));
      await tx.insert(schema.walletTransactions).values({
        householdId: input.householdId,
        walletId: wallet.id,
        memberId: participant.memberId,
        type: "MEAL_REFUND",
        amountPaise: participant.sharePaise,
        description: "Meal cancellation refund",
        referenceType: "MEAL",
        referenceId: meal.id,
        idempotencyKey: `${input.idempotencyKey}:${participant.memberId}`,
        createdBy: user.id,
      });
      await tx.insert(schema.notifications).values({
        householdId: input.householdId,
        userId: participant.memberId,
        type: "MEAL_CANCELLED",
        title: "Meal cancelled",
        message: "Your share has been returned to your wallet.",
        href: `/meals/${meal.id}`,
      });
    }

    await tx.insert(schema.auditLogs).values({
      householdId: input.householdId,
      actorId: user.id,
      action: "MEAL_CANCELLED",
      resourceType: "MEAL",
      resourceId: meal.id,
      details: { refundedParticipantCount: participants.length },
    });
    return { id: meal.id, alreadyCancelled: false };
  });
}
