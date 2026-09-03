import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { products, searchResults, searchHistory, sources } from "../db/schema.js";
import { newId } from "../lib/ids.js";
import { buildQueries } from "./queryBuilder.js";
import { runSearch, isSearchConfigured } from "./searchProviders/index.js";
import { fetchProductPage } from "./pageFetcher.js";
import { scoreCandidate, rankCandidates, classifyConfidence, type CandidateScore } from "./verification.js";
import { getCachedResult, upsertCacheResult } from "./searchCache.js";
import { ProviderNotConfiguredError } from "./searchProviders/types.js";
import { isDomainAllowed, type DomainFilterMode } from "./sourceTier.js";

const MAX_CANDIDATES_TO_VERIFY = 8;
const MAX_QUERIES_PER_PRODUCT = 4;

export interface ProductRow {
  id: string;
  styleCode: string;
  colour: string;
  category: string;
}

export interface SearchOutcome {
  status: "high_confidence" | "medium_confidence" | "needs_review" | "not_found" | "failed";
  confidence: number;
  imageUrl: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
  candidates: CandidateScore[];
  errorMessage?: string;
}

function recordSource(domain: string, tier: string) {
  const existing = db.select().from(sources).where(eq(sources.domain, domain)).get();
  if (!existing) {
    db.insert(sources)
      .values({ id: newId("src"), domain, tier: tier as any, trustScore: 50 })
      .run();
  }
}

/**
 * Run the full search -> fetch -> verify pipeline for one product. Persists
 * search_results + search_history rows and returns the ranked outcome. Does
 * NOT mutate the product's own row - callers decide what to write back.
 */
export interface SearchOptions {
  useCache?: boolean;
  /** Number of query variants to try, most-specific first (default 4). */
  maxQueries?: number;
  domainFilterMode?: DomainFilterMode;
  officialDomain?: string | null;
}

export async function searchAndVerifyProduct(
  product: ProductRow,
  opts: SearchOptions = {}
): Promise<SearchOutcome> {
  if (opts.useCache !== false) {
    const cached = getCachedResult(product.styleCode, product.colour);
    if (cached) {
      persistCandidates(product.id, cached.candidates, "cache");
      return {
        status: cached.status as SearchOutcome["status"],
        confidence: cached.confidence,
        imageUrl: cached.imageUrl,
        sourceUrl: cached.sourceUrl,
        sourceName: cached.sourceName,
        candidates: cached.candidates,
      };
    }
  }

  if (!isSearchConfigured()) {
    throw new ProviderNotConfiguredError(process.env.SEARCH_PROVIDER ?? "none");
  }

  const maxQueries = opts.maxQueries ?? MAX_QUERIES_PER_PRODUCT;
  const queries = buildQueries(product).slice(0, maxQueries);
  const seenUrls = new Set<string>();
  let rawResults: { url: string; title: string; snippet: string; domain: string; imageUrl?: string }[] = [];

  for (const query of queries) {
    const { provider, results, error } = await runSearch(query);
    db.insert(searchHistory)
      .values({
        id: newId("sh"),
        productId: product.id,
        query,
        provider,
        resultCount: results.length,
        success: !error,
        errorMessage: error ?? null,
      })
      .run();

    for (const r of results) {
      if (!r.url || seenUrls.has(r.url)) continue;
      seenUrls.add(r.url);
      rawResults.push(r);
    }
    if (rawResults.length >= MAX_CANDIDATES_TO_VERIFY * 2) break;
  }

  const domainFilterMode = opts.domainFilterMode ?? "none";
  if (domainFilterMode !== "none") {
    rawResults = rawResults.filter((r) => isDomainAllowed(r.domain, domainFilterMode, opts.officialDomain));
  }

  if (rawResults.length === 0) {
    const outcome: SearchOutcome = {
      status: "not_found",
      confidence: 0,
      imageUrl: null,
      sourceUrl: null,
      sourceName: null,
      candidates: [],
    };
    upsertCacheResult(product.styleCode, product.colour, outcome);
    return outcome;
  }

  const toVerify = rawResults.slice(0, MAX_CANDIDATES_TO_VERIFY);
  const scored: CandidateScore[] = [];
  for (const raw of toVerify) {
    const page = await fetchProductPage(raw.url);
    const score = scoreCandidate(product, raw, page);
    scored.push(score);
    recordSource(score.domain, score.sourceTier);
  }

  const ranked = rankCandidates(scored);
  persistCandidates(product.id, ranked, "live");

  const best = ranked[0];
  const status = best ? classifyConfidence(best.confidence) : "not_found";

  const outcome: SearchOutcome = {
    status,
    confidence: best?.confidence ?? 0,
    imageUrl: best?.imageUrl ?? null,
    sourceUrl: best?.url ?? null,
    sourceName: best?.domain ?? null,
    candidates: ranked,
  };

  upsertCacheResult(product.styleCode, product.colour, outcome);
  return outcome;
}

function persistCandidates(productId: string, candidates: CandidateScore[], provider: string) {
  db.delete(searchResults).where(eq(searchResults.productId, productId)).run();
  for (const [i, c] of candidates.entries()) {
    db.insert(searchResults)
      .values({
        id: newId("cand"),
        productId,
        provider,
        query: "",
        url: c.url,
        title: c.title,
        snippet: c.snippet,
        domain: c.domain,
        imageUrl: c.imageUrl ?? null,
        styleCodeMatch: c.styleCodeMatch,
        colourMatch: c.colourMatch,
        categoryMatch: c.categoryMatch,
        sourceTier: c.sourceTier as any,
        confidence: c.confidence,
        evidence: JSON.stringify(c.evidence),
        chosen: i === 0,
      })
      .run();
  }
}
