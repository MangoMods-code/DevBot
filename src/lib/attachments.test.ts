import { describe, it, expect } from "vitest";
import { isImageContentType, safeImageName } from "./attachments.js";

describe("isImageContentType", () => {
  it("accepts image types", () => {
    expect(isImageContentType("image/png")).toBe(true);
    expect(isImageContentType("image/jpeg")).toBe(true);
  });
  it("rejects non-images and null", () => {
    expect(isImageContentType("application/pdf")).toBe(false);
    expect(isImageContentType(null)).toBe(false);
  });
});

describe("safeImageName", () => {
  it("takes the extension from the filename, lowercased", () => {
    expect(safeImageName("Screenshot.PNG", "image/png")).toBe("portfolio-image.png");
  });
  it("falls back to the content type when the name has no extension", () => {
    expect(safeImageName("noext", "image/jpeg")).toBe("portfolio-image.jpeg");
  });
  it("defaults to png when nothing usable is given", () => {
    expect(safeImageName(null, null)).toBe("portfolio-image.png");
  });
  it("strips unsafe characters from the extension", () => {
    expect(safeImageName("weird.p!n g", null)).toBe("portfolio-image.png");
  });
});
