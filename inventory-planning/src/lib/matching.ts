export interface MatchSummary {
  label: string;
  totalInSource: number;
  matched: number;
  unmatched: number;
  unmatchedSample: string[];
}

/** How many SKUs in `sourceSkus` are found in `referenceSkus` — used to surface "X of Y SKUs matched, Z unmatched". */
export function computeMatchSummary(label: string, sourceSkus: Iterable<string>, referenceSkus: Set<string>, sampleSize = 10): MatchSummary {
  const uniqueSource = new Set([...sourceSkus].filter((s) => s));
  let matched = 0;
  const unmatchedSample: string[] = [];
  for (const sku of uniqueSource) {
    if (referenceSkus.has(sku)) matched += 1;
    else if (unmatchedSample.length < sampleSize) unmatchedSample.push(sku);
  }
  return {
    label,
    totalInSource: uniqueSource.size,
    matched,
    unmatched: uniqueSource.size - matched,
    unmatchedSample,
  };
}
