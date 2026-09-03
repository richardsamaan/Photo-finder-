export interface QueryProduct {
  styleCode: string;
  colour: string;
  category: string;
}

/**
 * Three escalating attempts for direct on-site search, accuracy-ordered
 * rather than cost-ordered (there is no external quota to conserve here):
 *   1. Style Code alone.
 *   2. Style Code + Colour Name.
 *   3. Style Code + Colour Name + Category (only if Category is present).
 * Each site's own search engine tokenizes this the same way a shopper
 * typing into its search box would - no need for multiple phrasings of the
 * same terms the way a generic web-search engine benefited from.
 */
export function buildEscalatingQueries(p: QueryProduct): string[] {
  const code = p.styleCode.trim();
  const colour = p.colour.trim();
  const category = p.category.trim();

  const attempts = [code, [code, colour].filter(Boolean).join(" ")];
  if (category) attempts.push([code, colour, category].filter(Boolean).join(" "));

  // De-dupe while preserving order (e.g. a blank colour collapses attempt 1 and 2).
  return Array.from(new Set(attempts.map((q) => q.replace(/\s+/g, " ").trim()))).filter(Boolean);
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
 * buildEscalatingQueries() above (no style code to anchor on).
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
