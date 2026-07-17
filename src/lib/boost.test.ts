import { describe, it, expect } from "vitest";
import { isNewBoost } from "./boost.js";

describe("isNewBoost", () => {
  it("fires when boost goes from none to some", () => {
    expect(isNewBoost(null, new Date())).toBe(true);
  });
  it("ignores non-boost member updates (still boosting)", () => {
    expect(isNewBoost(new Date("2026-01-01"), new Date("2026-01-01"))).toBe(false);
  });
  it("ignores boost removal", () => {
    expect(isNewBoost(new Date(), null)).toBe(false);
  });
  it("ignores updates with no boost involved", () => {
    expect(isNewBoost(null, null)).toBe(false);
  });
});
