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
