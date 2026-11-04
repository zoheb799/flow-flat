import { describe, expect, it } from "vitest";
import { normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("normalizes Indian ten-digit numbers and +91 numbers", () => {
    expect(normalizePhone("98765 43210")).toBe("+919876543210");
    expect(normalizePhone("+91 (98765) 43210")).toBe("+919876543210");
    expect(normalizePhone("919876543210")).toBe("+919876543210");
  });

  it("preserves valid international numbers", () => {
    expect(normalizePhone("+14155552671")).toBe("+14155552671");
  });

  it("rejects malformed or unsupported phone numbers", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("++919876543210")).toBeNull();
  });
});
