import { z } from "zod";

export const contributionSchema = z.object({
  householdId: z.string().uuid(),
  memberId: z.string().uuid(),
  amountPaise: z.number().int().positive().max(100_000_000),
  description: z.string().trim().min(2).max(200),
  idempotencyKey: z.string().uuid(),
});
