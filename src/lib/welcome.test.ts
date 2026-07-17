import { describe, it, expect } from "vitest";
import { renderWelcome, DEFAULT_WELCOME } from "./welcome.js";

describe("renderWelcome", () => {
  it("replaces every {user} placeholder", () => {
    expect(renderWelcome("hey {user}, {user}!", "<@1>")).toBe("hey <@1>, <@1>!");
  });
  it("default template contains the placeholder", () => {
    expect(DEFAULT_WELCOME).toContain("{user}");
  });
});
