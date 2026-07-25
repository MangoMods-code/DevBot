export function isImageContentType(contentType: string | null): boolean {
  return contentType != null && contentType.startsWith("image/");
}

// Discord resolves `attachment://<name>` by exact match, so the name must be simple and stable.
export function safeImageName(originalName: string | null, contentType: string | null): string {
  const fromName = originalName && originalName.includes(".") ? originalName.split(".").pop() : undefined;
  const fromType = contentType && contentType.startsWith("image/") ? contentType.slice("image/".length) : undefined;
  const ext = (fromName ?? fromType ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  return `portfolio-image.${ext}`;
}
