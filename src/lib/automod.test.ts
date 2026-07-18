import { describe, it, expect } from "vitest";
import { matchKeyword, hasLink, mentionScore, type KeywordRule } from "./automod.js";

const rules: KeywordRule[] = [
  { word: "badword", action: "delete" },
  { word: "worseword", action: "ban" },
];

describe("matchKeyword", () => {
  it("matches case-insensitively inside a sentence", () => {
    expect(matchKeyword("well BADWORD to you too", rules)?.action).toBe("delete");
  });
  it("returns the matched rule's action", () => {
    expect(matchKeyword("worseword", rules)?.action).toBe("ban");
  });
  it("returns undefined when clean", () => {
    expect(matchKeyword("perfectly nice message", rules)).toBeUndefined();
  });
});

describe("hasLink", () => {
  it.each([
    "check https://example.com out",
    "http://sketchy.site",
    "go to www.thing.io now",
    "join discord.gg/abc123",
    "join discord.com/invite/abc123",
  ])("detects %s", (s) => {
    expect(hasLink(s)).toBe(true);
  });
  it("ignores plain text with dots", () => {
    expect(hasLink("i mean...maybe. idk lol")).toBe(false);
  });
});

describe("mentionScore", () => {
  it("sums user and role mentions", () => {
    expect(mentionScore(3, 2, false)).toBe(5);
  });
  it("weights everyone-pings heavily", () => {
    expect(mentionScore(0, 0, true)).toBe(5);
  });
});
