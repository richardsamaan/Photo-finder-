import { env } from "../../env.js";
import { domainOf, fetchWithTimeout } from "../../lib/httpFetch.js";
import type { RawSearchResult, SearchProvider } from "./types.js";

// Google Programmable Search Engine - Custom Search JSON API
// https://developers.google.com/custom-search/v1/overview
export const googleCseProvider: SearchProvider = {
  name: "google_cse",

  isConfigured() {
    return Boolean(env.GOOGLE_API_KEY && env.GOOGLE_CSE_ID);
  },

  async search(query: string): Promise<RawSearchResult[]> {
    if (!this.isConfigured()) return [];
    const url = new URL("https://www.googleapis.com/customsearch/v1");
    url.searchParams.set("key", env.GOOGLE_API_KEY);
    url.searchParams.set("cx", env.GOOGLE_CSE_ID);
    url.searchParams.set("q", query);
    url.searchParams.set("num", "10");

    const res = await fetchWithTimeout(url.toString());
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Google CSE error ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as any;
    const items: any[] = data.items ?? [];

    return items.map((item) => {
      const cseImage =
        item.pagemap?.cse_image?.[0]?.src ?? item.pagemap?.metatags?.[0]?.["og:image"];
      return {
        url: item.link,
        title: item.title ?? "",
        snippet: item.snippet ?? "",
        domain: item.displayLink ?? domainOf(item.link),
        imageUrl: cseImage,
      } satisfies RawSearchResult;
    });
  },
};
