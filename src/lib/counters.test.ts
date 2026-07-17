import { describe, it, expect } from "vitest";
import { shouldRename, MIN_RENAME_INTERVAL_MS, type CounterState } from "./counters.js";

describe("shouldRename", () => {
  const base: CounterState = { lastRename: 1_000_000, lastValue: 10 };
  it("skips when value unchanged even after interval", () => {
    expect(shouldRename(base, 10, base.lastRename + MIN_RENAME_INTERVAL_MS * 2)).toBe(false);
  });
  it("skips when interval not elapsed", () => {
    expect(shouldRename(base, 11, base.lastRename + MIN_RENAME_INTERVAL_MS - 1)).toBe(false);
  });
  it("renames when value changed and interval elapsed", () => {
    expect(shouldRename(base, 11, base.lastRename + MIN_RENAME_INTERVAL_MS)).toBe(true);
  });
  it("renames immediately when never renamed before", () => {
    expect(shouldRename({ lastRename: 0, lastValue: null }, 5, 100)).toBe(true);
  });
});
