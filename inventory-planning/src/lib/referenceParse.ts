/**
 * Parses a Reference field formatted as `Style-ColourCode-Size`
 * (e.g. `50494697-002-L` -> { style: "50494697", colourCode: "002", size: "L" }).
 * Returns nulls for any part it can't confidently identify.
 */
export interface ParsedReference {
  style: string | null;
  colourCode: string | null;
  size: string | null;
}

export function parseStyleColourSize(reference: string | null | undefined): ParsedReference {
  if (!reference) return { style: null, colourCode: null, size: null };
  const parts = reference.trim().split("-").map((p) => p.trim()).filter((p) => p.length > 0);
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

export function resolveColourName(colourCode: string | null, colourKey: Map<string, string>): string | null {
  if (!colourCode) return null;
  return colourKey.get(colourCode.trim()) ?? null;
}
