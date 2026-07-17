import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "./db.js";

let db: Db;
beforeEach(() => { db = createDb(":memory:"); });

describe("guild config", () => {
  it("returns a default row with null settings", () => {
    const cfg = db.getConfig("g1");
    expect(cfg.guild_id).toBe("g1");
    expect(cfg.ticket_category).toBeNull();
  });
  it("sets and reads back a setting", () => {
    db.setConfig("g1", "vouch_channel", "c9");
    expect(db.getConfig("g1").vouch_channel).toBe("c9");
  });
});

describe("services", () => {
  it("adds and lists services", () => {
    db.addService("g1", "Discord Bot", "$50+", "Custom bots");
    db.addService("g1", "Website", "$100+", "Full site");
    expect(db.listServices("g1").map(s => s.name)).toEqual(["Discord Bot", "Website"]);
  });
  it("rejects duplicate names per guild", () => {
    db.addService("g1", "Bot", "$50", "d");
    expect(() => db.addService("g1", "Bot", "$60", "d")).toThrow();
  });
  it("updates and removes", () => {
    const s = db.addService("g1", "Bot", "$50", "d");
    db.updateService(s.id, "$75", "better");
    expect(db.getService("g1", "Bot")?.price).toBe("$75");
    db.removeService(s.id);
    expect(db.getService("g1", "Bot")).toBeUndefined();
  });
});

describe("tickets and vouches", () => {
  it("opens one ticket per user", () => {
    db.openTicket("g1", "ch1", "u1", "Bot", "$50");
    expect(db.getOpenTicketByUser("g1", "u1")?.channel_id).toBe("ch1");
  });
  it("close makes ticket vouch-eligible exactly once", () => {
    const t = db.openTicket("g1", "ch1", "u1", "Bot", "$50");
    expect(db.getUnvouchedClosedTicket("g1", "u1")).toBeUndefined();
    db.closeTicket(t.id, "transcript text");
    const closed = db.getUnvouchedClosedTicket("g1", "u1");
    expect(closed?.id).toBe(t.id);
    expect(db.getTicketByChannel("ch1")?.transcript).toBe("transcript text");
    db.addVouch("g1", "u1", t.id, 5, "great");
    db.markVouched(t.id);
    expect(db.getUnvouchedClosedTicket("g1", "u1")).toBeUndefined();
  });
});

describe("portfolio and storefront", () => {
  it("portfolio crud with message id", () => {
    const p = db.addPortfolio("g1", "AJD Site", "mechanic site", null, "https://x.com");
    db.setPortfolioMessage(p.id, "m1");
    expect(db.getPortfolioItem("g1", "AJD Site")?.message_id).toBe("m1");
    db.removePortfolio(p.id);
    expect(db.listPortfolio("g1")).toEqual([]);
  });
  it("storefront upsert", () => {
    db.setStorefront("g1", "c1", "m1");
    db.setStorefront("g1", "c2", "m2");
    expect(db.getStorefront("g1")).toMatchObject({ channel_id: "c2", message_id: "m2" });
  });
});
