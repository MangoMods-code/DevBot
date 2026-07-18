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
  it("storefront upsert with multiple message ids", () => {
    db.setStorefront("g1", "c1", ["m1"]);
    db.setStorefront("g1", "c2", ["m2", "m3"]);
    expect(db.getStorefront("g1")).toEqual({ channel_id: "c2", message_ids: ["m2", "m3"] });
  });
  it("reads legacy single-id storefront rows", () => {
    db.raw.prepare("INSERT INTO storefront_messages (guild_id, channel_id, message_id) VALUES (?, ?, ?)")
      .run("g9", "c9", "m9");
    expect(db.getStorefront("g9")).toEqual({ channel_id: "c9", message_ids: ["m9"] });
  });
});

describe("automod keywords", () => {
  it("stores keywords lowercased with upsert on action", () => {
    db.addKeyword("g1", "BadWord", "delete");
    db.addKeyword("g1", "badword", "ban");
    expect(db.listKeywords("g1")).toEqual([{ word: "badword", action: "ban" }]);
  });
  it("removes and reports whether anything was removed", () => {
    db.addKeyword("g1", "x", "delete");
    expect(db.removeKeyword("g1", "X")).toBe(true);
    expect(db.removeKeyword("g1", "x")).toBe(false);
    expect(db.listKeywords("g1")).toEqual([]);
  });
  it("stores automod settings in config", () => {
    db.setConfig("g1", "autorole_id", "r1");
    db.setConfig("g1", "link_action", "delete");
    db.setConfig("g1", "mention_limit", "8");
    const cfg = db.getConfig("g1");
    expect(cfg.autorole_id).toBe("r1");
    expect(cfg.link_action).toBe("delete");
    expect(cfg.mention_limit).toBe("8");
  });
});

describe("rules", () => {
  it("stores rules channel in config", () => {
    db.setConfig("g1", "rules_channel", "c5");
    expect(db.getConfig("g1").rules_channel).toBe("c5");
  });
  it("round-trips rules message ids and upserts", () => {
    db.setRulesMessages("g1", "c5", ["m1", "m2"]);
    db.setRulesMessages("g1", "c6", ["m3"]);
    expect(db.getRulesMessages("g1")).toEqual({ channel_id: "c6", message_ids: ["m3"] });
    expect(db.getRulesMessages("g2")).toBeUndefined();
  });
});
