import { z } from "zod";

export const commonContributionSchema = z.object({
  memberId: z.string().uuid(),
  amountPaise: z.number().int().positive().max(100_000_000),
  idempotencyKey: z.string().uuid(),
});

export const commonExpenseSchema = z.object({
  category: z.enum(["RICE", "WHEAT", "OIL", "VEGETABLES", "FRUITS", "MILK", "EGGS", "SPICES", "CLEANING", "OTHER"]),
  amountPaise: z.number().int().positive().max(100_000_000),
  description: z.string().trim().min(2).max(500),
  purchasedBy: z.string().uuid(),
  purchasedAt: z.string().datetime(),
  receiptUrl: z.string().url().max(2048).optional(),
  idempotencyKey: z.string().uuid(),
});
