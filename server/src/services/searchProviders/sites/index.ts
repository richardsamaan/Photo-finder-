import { createSiteAdapter } from "../createSiteAdapter.js";
import { createBrowserSiteAdapter } from "../createBrowserSiteAdapter.js";
import { SITE_CONFIGS } from "./configs.js";
import type { SearchProvider } from "../types.js";

// A config's `useBrowser` flag (see createSiteAdapter.ts's SiteAdapterConfig)
// picks which factory builds its adapter - a real headless browser for
// sites whose real search results only exist after their own JS runs, a
// plain HTTP fetch (cheaper, faster) for everyone else.
export const SITE_ADAPTERS: SearchProvider[] = SITE_CONFIGS.map((config) =>
  config.useBrowser ? createBrowserSiteAdapter(config) : createSiteAdapter(config)
);

export { SITE_CONFIGS };
