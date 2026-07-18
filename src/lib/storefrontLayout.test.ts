import { describe, it, expect } from "vitest";
import { chunkServices, menuOptionDescription, MAX_PER_MESSAGE } from "./storefrontLayout.js";
import type { Service } from "../db.js";

function svc(id: number, descLen = 50): Service {
  return { id, guild_id: "g", name: `Service ${id}`, price: "$50+", description: "d".repeat(descLen) };
}

describe("chunkServices", () => {
  it("keeps a small list in one chunk", () => {
    expect(chunkServices([svc(1), svc(2), svc(3)])).toHaveLength(1);
  });
  it("splits past 25 services (select menu limit)", () => {
    const many = Array.from({ length: 30 }, (_, i) => svc(i));
    const chunks = chunkServices(many);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(MAX_PER_MESSAGE);
    expect(chunks[1]).toHaveLength(5);
  });
  it("splits early when descriptions are huge (embed char limit)", () => {
    const chunky = Array.from({ length: 30 }, (_, i) => svc(i, 200));
    const chunks = chunkServices(chunky);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const chars = chunk.reduce((n, s) => n + s.name.length + s.price.length + s.description.length + 12, 0);
      expect(chars).toBeLessThanOrEqual(5200);
    }
  });
  it("handles empty list", () => {
    expect(chunkServices([])).toEqual([]);
  });
});

describe("menuOptionDescription", () => {
  it("joins price and description", () => {
    expect(menuOptionDescription("$50+", "Custom bots")).toBe("$50+ · Custom bots");
  });
  it("caps at 100 chars with ellipsis", () => {
    const out = menuOptionDescription("$50+", "x".repeat(200));
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out.endsWith("…")).toBe(true);
  });
});
