// Filename & path sanitization helpers. Used everywhere we write to disk
// from user-supplied or scraped-web data, so keep this conservative.

export function sanitizeFilenamePart(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[/\\?%*:|"<>]/g, "") // filesystem-unsafe chars
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_.-]/g, "")
    .replace(/_+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 80);
}

export function sanitizeCategoryFolder(input: string): string {
  const cleaned = sanitizeFilenamePart(input.replace(/\s+/g, " ").trim());
  return cleaned || "Uncategorized";
}

export function buildImageFilename(styleCode: string, colour: string, ext = "jpg"): string {
  const code = sanitizeFilenamePart(styleCode) || "UNKNOWN";
  const col = sanitizeFilenamePart(colour) || "Unknown";
  const safeExt = sanitizeFilenamePart(ext).toLowerCase() || "jpg";
  return `${code}-${col}.${safeExt}`;
}

// Guard against path traversal when joining user-controlled segments onto a base dir.
export function isPathInside(base: string, target: string): boolean {
  const rel = target.startsWith(base) ? target.slice(base.length) : null;
  if (rel === null) return false;
  return !rel.split(/[\\/]/).includes("..");
}
