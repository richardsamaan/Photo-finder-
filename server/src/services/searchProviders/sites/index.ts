import { createSiteAdapter } from "../createSiteAdapter.js";
import { SITE_CONFIGS } from "./configs.js";
import type { SearchProvider } from "../types.js";

export const SITE_ADAPTERS: SearchProvider[] = SITE_CONFIGS.map(createSiteAdapter);

export { SITE_CONFIGS };
