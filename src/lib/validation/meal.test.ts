import { describe, expect, it } from "vitest";
import { equalMealShares, weightedMealShares } from "./meal";

describe("equalMealShares", () => {
  it("splits an amount evenly among selected members", () => {
    expect(equalMealShares(60_000, ["member-a", "member-b", "member-c"])).toEqual([
      { memberId: "member-a", sharePaise: 20_000 },
      { memberId: "member-b", sharePaise: 20_000 },
      { memberId: "member-c", sharePaise: 20_000 },
    ]);
  });

  it("distributes remainder paise deterministically by member id", () => {
    expect(equalMealShares(1_000, ["member-c", "member-a", "member-b"])).toEqual([
      { memberId: "member-a", sharePaise: 334 },
      { memberId: "member-b", sharePaise: 333 },
      { memberId: "member-c", sharePaise: 333 },
    ]);
  });

  it("rejects an empty or duplicated participant list", () => {
    expect(() => equalMealShares(100, [])).toThrow();
    expect(() => equalMealShares(100, ["same", "same"])).toThrow();
  });

  it("supports weighted and percentage-style splits with deterministic paise rounding", () => {
    expect(weightedMealShares(1_000, [
      { memberId: "member-a", weight: 1 },
      { memberId: "member-b", weight: 2 },
    ])).toEqual([
      { memberId: "member-a", sharePaise: 334 },
      { memberId: "member-b", sharePaise: 666 },
    ]);
  });
});
