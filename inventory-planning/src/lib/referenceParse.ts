/**
 * Parses a Reference field into style / colour code / size.
 *
 * Most exports use `Style-ColourCode-Size` (e.g. `50494697-002-L`), but some
 * (observed in real SA79 exports, ~1% of rows — typically size-range packs)
 * use `Style ColourCode Size` with spaces instead, where the size segment
 * can itself contain a hyphen (e.g. `50522704 100 43-46`). Space form is
 * checked first since a hyphen-only split would otherwise chop that size
 * range in half and misread part of it as the colour code.
 */
export interface ParsedReference {
  style: string | null;
  colourCode: string | null;
  size: string | null;
}

export function parseStyleColourSize(reference: string | null | undefined): ParsedReference {
  if (!reference) return { style: null, colourCode: null, size: null };
  const trimmed = reference.trim();
  if (!trimmed) return { style: null, colourCode: null, size: null };

  if (/\s/.test(trimmed)) {
    const spaceParts = trimmed.split(/\s+/).filter((p) => p.length > 0);
    if (spaceParts.length >= 2) {
      const style = spaceParts[0];
      const colourCode = spaceParts[1];
      const size = spaceParts.slice(2).join(" ") || null;
      return { style, colourCode, size };
    }
  }

  const parts = trimmed.split("-").map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length < 2) return { style: null, colourCode: null, size: null };
  if (parts.length === 2) {
    // Style-ColourCode, no size present.
    return { style: parts[0], colourCode: parts[1], size: null };
  }
  // Style-ColourCode-Size (join any extra trailing hyphenated fragments back into size,
  // e.g. sizes like "34-32" would otherwise be split).
  const style = parts[0];
  const colourCode = parts[1];
  const size = parts.slice(2).join("-");
  return { style, colourCode, size };
}

/**
 * Colour codes appear as zero-padded text when parsed from a Reference
 * (e.g. "002") but as plain numbers when read from the Colour Key file's
 * own code column (e.g. 2) — Excel stores a numeric-looking cell as a
 * number by default, dropping any leading zeros. Stripping leading zeros
 * from both sides before comparing makes the two representations match
 * regardless of padding width (real exports mix 1-, 2-, and 3-digit codes).
 */
export function normalizeColourCode(code: string): string {
  const stripped = code.trim().replace(/^0+/, "");
  return stripped === "" ? "0" : stripped;
}

export function resolveColourName(colourCode: string | null, colourKey: Map<string, string>): string | null {
  if (!colourCode) return null;
  return colourKey.get(normalizeColourCode(colourCode)) ?? null;
}
