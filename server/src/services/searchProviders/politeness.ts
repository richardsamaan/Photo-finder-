import { env } from "../../env.js";

// Per-domain (not global) minimum gap between outbound requests, so a run
// searching all 9 sites doesn't needlessly serialize across different
// retailers - only repeated requests to the *same* site get spaced out. This
// is about being a good citizen toward each retailer's servers, not about
// conserving any quota (there is none).

const lastRequestAt = new Map<string, number>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function politeDelay(domain: string): Promise<void> {
  const now = Date.now();
  const last = lastRequestAt.get(domain) ?? 0;
  const wait = last + env.SITE_SEARCH_DELAY_MS - now;
  lastRequestAt.set(domain, Math.max(now, last + env.SITE_SEARCH_DELAY_MS));
  if (wait > 0) await sleep(wait);
}

/** Test-only: clears recorded timestamps so tests don't depend on real elapsed time. */
export function resetPoliteness(): void {
  lastRequestAt.clear();
}
