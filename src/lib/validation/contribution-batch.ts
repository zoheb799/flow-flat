import { z } from "zod";

export const contributionBatchSchema = z.object({
  householdId: z.string().uuid(),
  contributions: z.array(z.object({
    memberId: z.string().uuid(),
    amountPaise: z.number().int().positive().max(100_000_000),
  })).min(1).max(100),
  description: z.string().trim().min(2).max(200),
  idempotencyKey: z.string().uuid(),
}).superRefine((input, context) => {
  const memberIds = input.contributions.map(({ memberId }) => memberId);
  if (new Set(memberIds).size !== memberIds.length) {
    context.addIssue({
      code: "custom",
      message: "Each household member can only receive one contribution per batch.",
      path: ["contributions"],
    });
  }
});
