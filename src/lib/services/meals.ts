import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { authorizeHouseholdAccess } from "@/lib/auth/authorize";
import { createMealSchema } from "@/lib/validation/meal";
import { sendHouseholdPush } from "@/lib/notifications/push";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export async function createMeal(rawInput: unknown) {
  const input = createMealSchema.parse(rawInput);
  const { user } = await authorizeHouseholdAccess(input.householdId);
  if (!await consumeRateLimit("meal-create", `${input.householdId}:${user.id}`, 30, 60 * 60 * 1000)) {
    throw new Error("Too many meal requests. Try again later.");
  }
  const db = getDb();

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.householdId}), hashtext(${input.idempotencyKey}))`);
    const [existingMeal] = await tx.select({ id: schema.meals.id })
      .from(schema.meals)
      .where(and(
        eq(schema.meals.householdId, input.householdId),
        eq(schema.meals.idempotencyKey, input.idempotencyKey),
      ))
      .limit(1);
    if (existingMeal) return { id: existingMeal.id, pushRecipients: [] as Array<{ userId: string; sharePaise: number; balancePaise: number }> };

    const memberIds = input.participants.map((participant) => participant.memberId);
    const members = await tx.select({ userId: schema.householdMembers.userId })
      .from(schema.householdMembers)
      .where(and(
        eq(schema.householdMembers.householdId, input.householdId),
        inArray(schema.householdMembers.userId, [...memberIds, input.payerId]),
      ));

    if (members.length !== new Set([...memberIds, input.payerId]).size) {
      throw new Error("Payer and participants must belong to this household.");
    }

    const orderedParticipants = [...input.participants].sort((a, b) => a.memberId.localeCompare(b.memberId));
    const wallets = await tx.select({
      id: schema.wallets.id,
      memberId: schema.wallets.memberId,
      balancePaise: schema.wallets.balancePaise,
    })
      .from(schema.wallets)
      .where(and(
        eq(schema.wallets.householdId, input.householdId),
        inArray(schema.wallets.memberId, orderedParticipants.map(({ memberId }) => memberId)),
      ))
      .orderBy(schema.wallets.memberId)
      .for("update");

    const walletByMember = new Map(wallets.map((wallet) => [wallet.memberId, wallet]));
    if (walletByMember.size !== orderedParticipants.length) {
      throw new Error("A participant wallet is not available.");
    }

    for (const participant of orderedParticipants) {
      const wallet = walletByMember.get(participant.memberId);
      if (!wallet || wallet.balancePaise < participant.sharePaise) {
        throw new Error("A participant does not have enough wallet balance.");
      }
    }

    const [meal] = await tx.insert(schema.meals).values({
      householdId: input.householdId,
      name: input.name,
      category: input.category,
      totalPaise: input.totalPaise,
      payerId: input.payerId,
      idempotencyKey: input.idempotencyKey,
      description: input.description,
      eatenAt: new Date(input.eatenAt),
      createdBy: user.id,
    }).returning({ id: schema.meals.id });

    await tx.insert(schema.mealParticipants).values(orderedParticipants.map((participant) => ({
      householdId: input.householdId,
      mealId: meal.id,
      memberId: participant.memberId,
      sharePaise: participant.sharePaise,
    })));

    for (const participant of orderedParticipants) {
      const wallet = walletByMember.get(participant.memberId)!;
      await tx.update(schema.wallets)
        .set({
          balancePaise: sql`${schema.wallets.balancePaise} - ${participant.sharePaise}`,
          updatedAt: new Date(),
        })
        .where(and(
          eq(schema.wallets.householdId, input.householdId),
          eq(schema.wallets.id, wallet.id),
        ));

      await tx.insert(schema.walletTransactions).values({
        householdId: input.householdId,
        walletId: wallet.id,
        memberId: participant.memberId,
        type: "MEAL_DEBIT",
        amountPaise: participant.sharePaise,
        description: input.name,
        referenceType: "MEAL",
        referenceId: meal.id,
        idempotencyKey: `${input.idempotencyKey}:${participant.memberId}`,
        createdBy: user.id,
      });

      await tx.insert(schema.notifications).values({
        householdId: input.householdId,
        userId: participant.memberId,
        type: "MEAL_ADDED",
        title: "You've been added to a meal",
        message: `${input.name} — your share is ₹${(participant.sharePaise / 100).toFixed(2)}.`,
        href: `/meals/${meal.id}`,
      });
    }

    const allHouseholdMembers = await tx.select({ userId: schema.householdMembers.userId })
      .from(schema.householdMembers)
      .where(eq(schema.householdMembers.householdId, input.householdId));
    const participantSet = new Set(memberIds);
    const notIncluded = allHouseholdMembers.filter((member) => !participantSet.has(member.userId));
    if (notIncluded.length) {
      await tx.insert(schema.notifications).values(notIncluded.map(({ userId }) => ({
        householdId: input.householdId,
        userId,
        type: "MEAL_NOT_INCLUDED",
        title: "New meal recorded",
        message: `${input.name} · ₹${(input.totalPaise / 100).toFixed(2)}. You were not included, so no amount was deducted.`,
        href: `/meals/${meal.id}`,
      })));
    }

    await tx.insert(schema.auditLogs).values({
      householdId: input.householdId,
      actorId: user.id,
      action: "MEAL_CREATED",
      resourceType: "MEAL",
      resourceId: meal.id,
      details: { participantCount: orderedParticipants.length, totalPaise: input.totalPaise },
    });

    return {
      id: meal.id,
      pushRecipients: orderedParticipants.map((participant) => ({
        userId: participant.memberId,
        sharePaise: participant.sharePaise,
        balancePaise: walletByMember.get(participant.memberId)!.balancePaise - participant.sharePaise,
      })),
    };
  });
  await sendHouseholdPush(input.householdId, result.pushRecipients.map(({ userId }) => userId), (userId) => {
    const recipient = result.pushRecipients.find((item) => item.userId === userId)!;
    return {
      title: "You've been added to a meal",
      body: `${input.name} · your share is ₹${(recipient.sharePaise / 100).toFixed(2)}. Remaining balance: ₹${(recipient.balancePaise / 100).toFixed(2)}.`,
      url: `/meals/${result.id}`,
    };
  });
  return { id: result.id };
}
