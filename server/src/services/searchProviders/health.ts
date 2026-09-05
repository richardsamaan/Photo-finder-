// Simple in-process per-site success/failure tracking (requirement 4 of the
// direct-site-search brief) - deliberately not persisted, this is a live
// "does this adapter need attention right now" signal, not a historical
// report. "Succeeded" means the adapter's HTTP fetch + HTML parse completed
// normally (regardless of whether it found a matching product - a
// legitimate zero-results page is still a healthy fetch); "failed" means a
// network error, non-2xx response, or a detected bot-check/CAPTCHA wall. A
// failing site is skipped for that item, never treated as a pipeline error.

export interface SiteHealthEntry {
  attempts: number;
  succeeded: number;
  failed: number;
  resultsReturned: number;
  lastError?: string;
}

const health = new Map<string, SiteHealthEntry>();

function entryFor(site: string): SiteHealthEntry {
  let e = health.get(site);
  if (!e) {
    e = { attempts: 0, succeeded: 0, failed: 0, resultsReturned: 0 };
    health.set(site, e);
  }
  return e;
}

export function recordSiteSuccess(site: string, resultCount: number): void {
  const e = entryFor(site);
  e.attempts++;
  e.succeeded++;
  e.resultsReturned += resultCount;
}

export function recordSiteFailure(site: string, error: string): void {
  const e = entryFor(site);
  e.attempts++;
  e.failed++;
  e.lastError = error;
}

export function getSiteHealthSnapshot(): Record<string, SiteHealthEntry> {
  return Object.fromEntries(health.entries());
}

export function resetSiteHealth(): void {
  health.clear();
}
