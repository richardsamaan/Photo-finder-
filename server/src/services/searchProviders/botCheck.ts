// Heuristic detection of "this wasn't a real results page" - a bot-check,
// CAPTCHA wall, or rate-limit response - so the adapter can report it as a
// failure (worth investigating) rather than silently treating it as "this
// site legitimately has zero results for this query".

const BLOCK_STATUS_CODES = new Set([403, 429, 503]);

const BLOCK_MARKERS = [
  "access denied",
  "are you a human",
  "are you a robot",
  "pardon our interruption",
  "captcha",
  "unusual traffic",
  "request unsuccessful",
  "attention required! | cloudflare",
  "sorry, you have been blocked",
  "checking your browser",
];

export function looksLikeBotBlock(status: number, html: string): boolean {
  if (BLOCK_STATUS_CODES.has(status)) return true;
  const lower = html.slice(0, 4000).toLowerCase();
  return BLOCK_MARKERS.some((marker) => lower.includes(marker));
}
