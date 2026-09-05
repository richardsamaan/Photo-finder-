import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { products, searchResults, searchHistory, sources } from "../db/schema.js";
import { newId } from "../lib/ids.js";
import { buildEscalatingQueries } from "./queryBuilder.js";
import { runSiteSearch } from "./searchProviders/index.js";
import { fetchProductPage } from "./pageFetcher.js";
import { scoreCandidate, rankCandidates, classifyConfidence, type CandidateScore } from "./verification.js";
import { getCachedResult, upsertCacheResult } from "./searchCache.js";
import { isDomainAllowed, type DomainFilterMode } from "./sourceTier.js";

const MAX_CANDIDATES_TO_VERIFY = 8;

export interface ProductRow {
  id: string;
  styleCode: string;
  colour: string;
  colourCode?: string | null;
  category: string;
}

export interface SearchOutcome {
  status: "high_confidence" | "medium_confidence" | "needs_review" | "not_found" | "failed";
  confidence: number;
  imageUrl: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
  candidates: CandidateScore[];
  /** Which escalating attempt (1 = Style Code, 2 = +Colour Name, 3 = +Colour Code) produced this outcome. */
  attemptsUsed: number;
  errorMessage?: string;
}

export interface SearchOptions {
  useCache?: boolean;
  domainFilterMode?: DomainFilterMode;
  officialDomain?: string | null;
}

function recordSource(domain: string, tier: string) {
  const existing = db.select().from(sources).where(eq(sources.domain, domain)).get();
  if (!existing) {
    db.insert(sources)
      .values({ id: newId("src"), domain, tier: tier as any, trustScore: 50 })
      .run();
  }
}

function isConfidentMatch(status: SearchOutcome["status"]): boolean {
  return status === "high_confidence" || status === "medium_confidence";
}

/**
 * Runs one escalating attempt (a single text query fanned out across every
 * enabled site adapter) and returns the ranked, verified candidates.
 */
async function runOneAttempt(
  product: ProductRow,
  query: string,
  domainFilterMode: DomainFilterMode,
  officialDomain: string | null | undefined
): Promise<CandidateScore[]> {
  const { results } = await runSiteSearch(query, { domainFilterMode, officialDomain });

  db.insert(searchHistory)
    .values({
      id: newId("sh"),
      productId: product.id,
      query,
      provider: "site-search",
      resultCount: results.length,
      success: true,
    })
    .run();

  const seenUrls = new Set<string>();
  const rawResults = results.filter((r) => {
    if (!r.url || seenUrls.has(r.url)) return false;
    seenUrls.add(r.url);
    return true;
  });

  const toVerify = rawResults.slice(0, MAX_CANDIDATES_TO_VERIFY);
  const scored: CandidateScore[] = [];
  for (const raw of toVerify) {
    const page = await fetchProductPage(raw.url);
    const score = scoreCandidate(product, raw, page);
    scored.push(score);
    recordSource(score.domain, score.sourceTier);
  }

  return rankCandidates(scored);
}

/**
 * Runs the full escalating search -> fetch -> verify pipeline for one
 * product: Style Code alone, then +Colour Name, then +Colour Code, stopping
 * as soon as a confident match is found. Since there's no external quota to
 * conserve, all three attempts can run back-to-back in a single call.
 * Persists search_results + search_history rows and returns the best
 * outcome across whichever attempts ran. Does NOT mutate the product's own
 * row - callers decide what to write back.
 */
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
        attemptsUsed: 0,
      };
    }
  }

  const queries = buildEscalatingQueries(product);
  const domainFilterMode = opts.domainFilterMode ?? "none";

  let ranked: CandidateScore[] = [];
  let attemptsUsed = 0;

  for (const query of queries) {
    attemptsUsed++;
    ranked = await runOneAttempt(product, query, domainFilterMode, opts.officialDomain);
    const best = ranked[0];
    if (best && isConfidentMatch(classifyConfidence(best.confidence))) break;
  }

  persistCandidates(product.id, ranked, "site-search");

  const best = ranked[0];
  const status = best ? classifyConfidence(best.confidence) : "not_found";

  const outcome: SearchOutcome = {
    status,
    confidence: best?.confidence ?? 0,
    imageUrl: best?.imageUrl ?? null,
    sourceUrl: best?.url ?? null,
    sourceName: best?.domain ?? null,
    candidates: ranked,
    attemptsUsed,
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
