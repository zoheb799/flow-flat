import { describe, expect, it } from "vitest";
import { contributionBatchSchema } from "./contribution-batch";

const memberA = "00000000-0000-4000-8000-000000000001";
const memberB = "00000000-0000-4000-8000-000000000002";
const householdId = "00000000-0000-4000-8000-000000000003";
const idempotencyKey = "00000000-0000-4000-8000-000000000004";

describe("contributionBatchSchema", () => {
  it("accepts equal or per-member credit amounts", () => {
    expect(contributionBatchSchema.safeParse({
      householdId,
      contributions: [
        { memberId: memberA, amountPaise: 50_000 },
        { memberId: memberB, amountPaise: 50_000 },
      ],
      description: "Monthly top-up",
      idempotencyKey,
    }).success).toBe(true);

    expect(contributionBatchSchema.safeParse({
      householdId,
      contributions: [
        { memberId: memberA, amountPaise: 20_000 },
        { memberId: memberB, amountPaise: 15_000 },
      ],
      description: "Monthly top-up",
      idempotencyKey,
    }).success).toBe(true);
  });

  it("rejects duplicated members and zero-value entries", () => {
    expect(contributionBatchSchema.safeParse({
      householdId,
      contributions: [
        { memberId: memberA, amountPaise: 20_000 },
        { memberId: memberA, amountPaise: 15_000 },
      ],
      description: "Monthly top-up",
      idempotencyKey,
    }).success).toBe(false);
    expect(contributionBatchSchema.safeParse({
      householdId,
      contributions: [{ memberId: memberA, amountPaise: 0 }],
      description: "Monthly top-up",
      idempotencyKey,
    }).success).toBe(false);
  });
});
