import { z } from "zod";

const mealFieldsSchema = z.object({
  householdId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  category: z.enum(["BREAKFAST", "LUNCH", "DINNER", "SNACKS", "TEA_COFFEE", "GROCERIES", "OTHER"]),
  totalPaise: z.number().int().positive().max(100_000_000),
  payerId: z.string().uuid(),
  participants: z.array(z.object({
    memberId: z.string().uuid(),
    sharePaise: z.number().int().positive().max(100_000_000),
  })).min(1).max(100),
  description: z.string().trim().max(1000).optional(),
  eatenAt: z.string().datetime(),
  idempotencyKey: z.string().uuid(),
});

export const createMealSchema = mealFieldsSchema.superRefine((meal, context) => {
  const memberIds = meal.participants.map((participant) => participant.memberId);
  if (new Set(memberIds).size !== memberIds.length) {
    context.addIssue({ code: "custom", path: ["participants"], message: "Participants must be unique." });
  }
  if (meal.participants.reduce((sum, participant) => sum + participant.sharePaise, 0) !== meal.totalPaise) {
    context.addIssue({ code: "custom", path: ["participants"], message: "Participant shares must equal the total expense." });
  }
});

export const editMealSchema = mealFieldsSchema.superRefine((meal, context) => {
  const memberIds = meal.participants.map((participant) => participant.memberId);
  if (new Set(memberIds).size !== memberIds.length) {
    context.addIssue({ code: "custom", path: ["participants"], message: "Participants must be unique." });
  }
  if (meal.participants.reduce((sum, participant) => sum + participant.sharePaise, 0) !== meal.totalPaise) {
    context.addIssue({ code: "custom", path: ["participants"], message: "Participant shares must equal the total expense." });
  }
});

export const equalMealShares = (totalPaise: number, memberIds: string[]) => {
  const orderedIds = [...new Set(memberIds)].sort();
  if (orderedIds.length === 0 || orderedIds.length !== memberIds.length) {
    throw new Error("At least one unique participant is required.");
  }
  const baseShare = Math.floor(totalPaise / orderedIds.length);
  const remainder = totalPaise % orderedIds.length;
  return orderedIds.map((memberId, index) => ({
    memberId,
    sharePaise: baseShare + (index < remainder ? 1 : 0),
  }));
};

export const weightedMealShares = (
  totalPaise: number,
  weights: Array<{ memberId: string; weight: number }>,
) => {
  const orderedWeights = [...weights].sort((a, b) => a.memberId.localeCompare(b.memberId));
  if (
    totalPaise <= 0 ||
    orderedWeights.length === 0 ||
    new Set(orderedWeights.map(({ memberId }) => memberId)).size !== orderedWeights.length ||
    orderedWeights.some(({ weight }) => !Number.isSafeInteger(weight) || weight <= 0)
  ) {
    throw new Error("Provide a positive amount and positive weight for every unique participant.");
  }
  const totalWeight = orderedWeights.reduce((sum, item) => sum + item.weight, 0);
  const shares = orderedWeights.map(({ memberId, weight }) => ({
    memberId,
    sharePaise: Math.floor((totalPaise * weight) / totalWeight),
  }));
  let remainder = totalPaise - shares.reduce((sum, item) => sum + item.sharePaise, 0);
  for (const share of shares) {
    if (remainder === 0) break;
    share.sharePaise += 1;
    remainder -= 1;
  }
  return shares;
};
