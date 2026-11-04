import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { authorizeHouseholdRole } from "@/lib/auth/authorize";
import { getDb, schema } from "@/lib/db";
import { sendHouseholdPush } from "@/lib/notifications/push";
import { editMealSchema } from "@/lib/validation/meal";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export async function editMeal(mealId: string, rawInput: unknown) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(mealId)) {
    throw new Error("Meal not found.");
  }
  const input = editMealSchema.parse(rawInput);
  const { user } = await authorizeHouseholdRole(input.householdId, ["ADMIN"]);
  if (!await consumeRateLimit("meal-edit", `${input.householdId}:${user.id}`, 30, 60 * 60 * 1000)) {
    throw new Error("Too many meal updates. Try again later.");
  }
  const db = getDb();

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.householdId}), hashtext(${input.idempotencyKey}))`);
    const [alreadyApplied] = await tx.select({ resourceId: schema.auditLogs.resourceId })
      .from(schema.auditLogs)
      .where(and(
        eq(schema.auditLogs.householdId, input.householdId),
        eq(schema.auditLogs.idempotencyKey, input.idempotencyKey),
      ))
      .limit(1);
    if (alreadyApplied?.resourceId) return { id: alreadyApplied.resourceId, recipients: [] as Array<{ userId: string; sharePaise: number; balancePaise: number }> };

    const [meal] = await tx.select({
      id: schema.meals.id,
      cancelledAt: schema.meals.cancelledAt,
      name: schema.meals.name,
      category: schema.meals.category,
      totalPaise: schema.meals.totalPaise,
      description: schema.meals.description,
      eatenAt: schema.meals.eatenAt,
    })
      .from(schema.meals)
      .where(and(
        eq(schema.meals.householdId, input.householdId),
        eq(schema.meals.id, mealId),
      ))
      .for("update");
    if (!meal) throw new Error("Meal not found.");
    if (meal.cancelledAt) throw new Error("A cancelled meal cannot be edited.");

    const requestedMemberIds = input.participants.map(({ memberId }) => memberId);
    const memberIds = [...new Set([...requestedMemberIds, input.payerId])];
    const memberships = await tx.select({ userId: schema.householdMembers.userId })
      .from(schema.householdMembers)
      .where(and(
        eq(schema.householdMembers.householdId, input.householdId),
        inArray(schema.householdMembers.userId, memberIds),
      ));
    if (memberships.length !== memberIds.length) {
      throw new Error("Payer and participants must belong to this household.");
    }

    const previousParticipants = await tx.select({
      memberId: schema.mealParticipants.memberId,
      sharePaise: schema.mealParticipants.sharePaise,
    })
      .from(schema.mealParticipants)
      .where(and(
        eq(schema.mealParticipants.householdId, input.householdId),
        eq(schema.mealParticipants.mealId, mealId),
      ));
    const oldShareByMember = new Map(previousParticipants.map(({ memberId, sharePaise }) => [memberId, sharePaise]));
    const newShareByMember = new Map(input.participants.map(({ memberId, sharePaise }) => [memberId, sharePaise]));
    const affectedMemberIds = [...new Set([...oldShareByMember.keys(), ...newShareByMember.keys()])].sort();
    const wallets = await tx.select({
      id: schema.wallets.id,
      memberId: schema.wallets.memberId,
      balancePaise: schema.wallets.balancePaise,
    })
      .from(schema.wallets)
      .where(and(
        eq(schema.wallets.householdId, input.householdId),
        inArray(schema.wallets.memberId, affectedMemberIds),
      ))
      .orderBy(schema.wallets.memberId)
      .for("update");
    const walletByMember = new Map(wallets.map((wallet) => [wallet.memberId, wallet]));
    if (walletByMember.size !== affectedMemberIds.length) {
      throw new Error("A participant wallet is not available.");
    }

    const deltas = affectedMemberIds.map((memberId) => ({
      memberId,
      deltaPaise: (newShareByMember.get(memberId) ?? 0) - (oldShareByMember.get(memberId) ?? 0),
    }));
    for (const { memberId, deltaPaise } of deltas) {
      const wallet = walletByMember.get(memberId)!;
      if (deltaPaise > 0 && wallet.balancePaise < deltaPaise) {
        throw new Error("A participant does not have enough wallet balance for the updated share.");
      }
      if (deltaPaise < 0 && wallet.balancePaise - deltaPaise > Number.MAX_SAFE_INTEGER) {
        throw new Error("Refund would exceed the maximum supported wallet balance.");
      }
    }

    const updatedAt = new Date();
    await tx.update(schema.meals).set({
      name: input.name,
      category: input.category,
      totalPaise: input.totalPaise,
      payerId: input.payerId,
      description: input.description,
      eatenAt: new Date(input.eatenAt),
      updatedAt,
    }).where(eq(schema.meals.id, mealId));
    await tx.delete(schema.mealParticipants)
      .where(and(
        eq(schema.mealParticipants.householdId, input.householdId),
        eq(schema.mealParticipants.mealId, mealId),
      ));
    await tx.insert(schema.mealParticipants).values(input.participants.map((participant) => ({
      householdId: input.householdId,
      mealId,
      memberId: participant.memberId,
      sharePaise: participant.sharePaise,
    })));

    for (const { memberId, deltaPaise } of deltas) {
      if (deltaPaise === 0) continue;
      const wallet = walletByMember.get(memberId)!;
      await tx.update(schema.wallets)
        .set({
          balancePaise: deltaPaise > 0
            ? sql`${schema.wallets.balancePaise} - ${deltaPaise}`
            : sql`${schema.wallets.balancePaise} + ${-deltaPaise}`,
          updatedAt,
        })
        .where(eq(schema.wallets.id, wallet.id));
      await tx.insert(schema.walletTransactions).values({
        householdId: input.householdId,
        walletId: wallet.id,
        memberId,
        type: deltaPaise > 0 ? "MEAL_DEBIT" : "MEAL_REFUND",
        amountPaise: Math.abs(deltaPaise),
        description: `Meal updated: ${input.name}`,
        referenceType: "MEAL",
        referenceId: mealId,
        idempotencyKey: `${input.idempotencyKey}:${memberId}`,
        createdBy: user.id,
      });
    }

    const currentMembers = await tx.select({ userId: schema.householdMembers.userId })
      .from(schema.householdMembers)
      .where(eq(schema.householdMembers.householdId, input.householdId));
    const participantSet = new Set(requestedMemberIds);
    const recipients = currentMembers.map(({ userId }) => {
      const sharePaise = newShareByMember.get(userId);
      const wallet = walletByMember.get(userId);
      const deltaPaise = deltas.find((delta) => delta.memberId === userId)?.deltaPaise ?? 0;
      if (sharePaise !== undefined) {
        return {
          userId,
          sharePaise,
          balancePaise: wallet!.balancePaise - deltaPaise,
        };
      }
      if (oldShareByMember.has(userId)) {
        return {
          userId,
          sharePaise: 0,
          balancePaise: wallet!.balancePaise - deltaPaise,
        };
      }
      return null;
    }).filter((recipient): recipient is { userId: string; sharePaise: number; balancePaise: number } => recipient !== null);

    await tx.insert(schema.notifications).values(recipients.map((recipient) => ({
      householdId: input.householdId,
      userId: recipient.userId,
      type: "MEAL_EDITED",
      title: "Meal details updated",
      message: participantSet.has(recipient.userId)
        ? `${input.name} · your updated share is ₹${(recipient.sharePaise / 100).toFixed(2)}.`
        : `${input.name} was updated. Your share was refunded.`,
      href: `/meals/${mealId}`,
    })));
    await tx.insert(schema.auditLogs).values({
      householdId: input.householdId,
      actorId: user.id,
      action: "MEAL_EDITED",
      resourceType: "MEAL",
      resourceId: mealId,
      idempotencyKey: input.idempotencyKey,
      details: {
        before: {
          name: meal.name,
          category: meal.category,
          totalPaise: meal.totalPaise,
          description: meal.description,
          eatenAt: meal.eatenAt,
          participants: previousParticipants,
        },
        after: {
          name: input.name,
          category: input.category,
          totalPaise: input.totalPaise,
          description: input.description ?? null,
          eatenAt: input.eatenAt,
          participants: input.participants,
        },
      },
    });
    return { id: mealId, recipients };
  });

  await sendHouseholdPush(input.householdId, result.recipients.map(({ userId }) => userId), (userId) => {
    const recipient = result.recipients.find((item) => item.userId === userId)!;
    return {
      title: "Meal details updated",
      body: recipient.sharePaise
        ? `${input.name} · your updated share is ₹${(recipient.sharePaise / 100).toFixed(2)}.`
        : `${input.name} was updated and your previous share was refunded.`,
      url: `/meals/${mealId}`,
    };
  });
  return { id: result.id };
}
