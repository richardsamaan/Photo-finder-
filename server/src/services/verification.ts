import type { RawSearchResult } from "./searchProviders/types.js";
import type { PageContent } from "./pageFetcher.js";
import {
  textContainsStyleCode,
  textContainsColour,
  textContainsConflictingColour,
  textContainsCategory,
} from "./matching.js";
import { classifySourceTier, trustScoreForTier, type SourceTier } from "./sourceTier.js";

export interface ProductQuery {
  styleCode: string;
  colour: string;
  category: string;
}

export interface CandidateScore {
  url: string;
  domain: string;
  title: string;
  snippet: string;
  imageUrl?: string;
  styleCodeMatch: boolean;
  colourMatch: boolean;
  colourConflict: boolean;
  categoryMatch: boolean;
  sourceTier: SourceTier;
  confidence: number;
  evidence: string[];
}

/**
 * Score a single search result against the requested product. This is the
 * heart of the "never select an image just because it looks similar" rule:
 * an exact style-code match dominates the score; everything else only
 * refines within that.
 */
export function scoreCandidate(
  product: ProductQuery,
  raw: RawSearchResult,
  page: PageContent | null
): CandidateScore {
  const evidence: string[] = [];
  const searchableText = [raw.title, raw.snippet, page?.text ?? ""].join(" \n ");

  if (page?.blockedByRobots) {
    evidence.push(`Page blocked by robots.txt — verified from search snippet only`);
  }

  const styleCodeMatch = textContainsStyleCode(searchableText, product.styleCode);
  const colourMatch = textContainsColour(searchableText, product.colour);
  const colourConflict = !colourMatch && textContainsConflictingColour(searchableText, product.colour);
  const categoryMatch = textContainsCategory(searchableText, product.category);

  const tier = classifySourceTier(raw.domain, searchableText);

  let score = 0;

  if (styleCodeMatch) {
    score += 55;
    evidence.push(`Style code "${product.styleCode}" found on page/listing`);
  } else {
    evidence.push(`Style code "${product.styleCode}" NOT found — cannot verify exact product`);
    score = Math.min(score, 15); // hard cap: no code match => never above NEEDS REVIEW
  }

  if (colourConflict) {
    score -= 40;
    evidence.push(`Page indicates a different colour than requested "${product.colour}"`);
  } else if (colourMatch) {
    score += 25;
    evidence.push(`Colour "${product.colour}" confirmed`);
  } else {
    evidence.push(`Colour "${product.colour}" not confirmed on page`);
  }

  if (categoryMatch) {
    score += 10;
    evidence.push(`Category "${product.category}" confirmed`);
  }

  const trustBonus = Math.round(trustScoreForTier(tier) / 10);
  score += trustBonus;
  evidence.push(`Source: ${raw.domain} (${tier.replace("_", " ")}, trust +${trustBonus})`);

  const hasImage = Boolean(raw.imageUrl || page?.images?.length);
  if (hasImage) {
    score += 5;
  } else {
    evidence.push(`No product image found on this candidate`);
  }

  score = Math.max(0, Math.min(100, score));
  if (!styleCodeMatch) score = Math.min(score, 15);

  return {
    url: raw.url,
    domain: raw.domain,
    title: raw.title,
    snippet: raw.snippet,
    imageUrl: raw.imageUrl ?? page?.images?.[0]?.url,
    styleCodeMatch,
    colourMatch,
    colourConflict,
    categoryMatch,
    sourceTier: tier,
    confidence: score,
    evidence,
  };
}

export type ProductStatus =
  | "high_confidence"
  | "medium_confidence"
  | "needs_review"
  | "not_found";

export function classifyConfidence(score: number): ProductStatus {
  if (score >= 90) return "high_confidence";
  if (score >= 70) return "medium_confidence";
  return "needs_review";
}

/**
 * Rank candidates. Style-code match is the primary sort key (evidence-based
 * exact match beats everything, including a higher raw score from trust/
 * colour bonuses on a non-matching product), then confidence score, then
 * whether an image is available.
 */
export function rankCandidates(candidates: CandidateScore[]): CandidateScore[] {
  return [...candidates].sort((a, b) => {
    if (a.styleCodeMatch !== b.styleCodeMatch) return a.styleCodeMatch ? -1 : 1;
    if (a.confidence !== b.confidence) return b.confidence - a.confidence;
    const aImg = a.imageUrl ? 1 : 0;
    const bImg = b.imageUrl ? 1 : 0;
    if (aImg !== bImg) return bImg - aImg;
    return 0;
  });
}
