import { describe, it, expect } from "vitest";
import { buildTranscript } from "./transcript.js";

describe("buildTranscript", () => {
  it("formats oldest-first with ISO timestamps", () => {
    const out = buildTranscript([
      { author: "mango", content: "hi", createdAt: new Date("2026-07-17T10:00:00Z") },
      { author: "client", content: "hello", createdAt: new Date("2026-07-17T10:01:00Z") },
    ]);
    expect(out).toBe(
      "[2026-07-17T10:00:00.000Z] mango: hi\n[2026-07-17T10:01:00.000Z] client: hello"
    );
  });
  it("handles empty message list", () => {
    expect(buildTranscript([])).toBe("(no messages)");
  });
});
