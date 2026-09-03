export interface QueryProduct {
  styleCode: string;
  colour: string;
  category: string;
}

/** Generate multiple search queries per product, most-specific first. */
export function buildQueries(p: QueryProduct): string[] {
  const code = p.styleCode.trim();
  const colour = p.colour.trim();
  const category = p.category.trim();

  const queries = [
    `"${code}" "${colour}"`,
    `${code} ${colour}`,
    `"${code}" product`,
    `${code} ${category}`,
    `"${code}" ${colour} ${category}`,
    `${code}`,
  ];

  // De-dupe while preserving order
  return Array.from(new Set(queries.map((q) => q.replace(/\s+/g, " ").trim())));
}

export interface QuickSearchQueryParams {
  /** Free-text item name/description, may already include a brand. */
  query: string;
  colourName?: string;
}

/**
 * Query variations for the single-item quick-search tool: the raw query
 * plus "product photo" / "high resolution" framing, and a colour-qualified
 * pass when a colour name is supplied. Broader and less structured than
 * buildQueries() above (no style code to anchor on).
 */
export function buildQuickSearchQueries(p: QuickSearchQueryParams): string[] {
  const q = p.query.trim();
  const colour = p.colourName?.trim();

  const queries = [
    q,
    `${q} product photo`,
    `${q} high resolution`,
    `${q} official product image`,
    `${q} studio photo white background`,
  ];

  if (colour) {
    queries.push(`${q} ${colour}`, `${q} ${colour} product photo`);
  }

  return Array.from(new Set(queries.map((s) => s.replace(/\s+/g, " ").trim()))).filter(Boolean);
}
