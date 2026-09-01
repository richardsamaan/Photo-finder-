import { env } from "../../env.js";
import { domainOf, fetchWithTimeout } from "../../lib/httpFetch.js";
import type { RawSearchResult, SearchProvider } from "./types.js";

// SerpAPI - Google results aggregator. https://serpapi.com/search-api
export const serpApiProvider: SearchProvider = {
  name: "serpapi",

  isConfigured() {
    return Boolean(env.SERPAPI_API_KEY);
  },

  async search(query: string): Promise<RawSearchResult[]> {
    if (!this.isConfigured()) return [];
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google");
    url.searchParams.set("q", query);
    url.searchParams.set("api_key", env.SERPAPI_API_KEY);
    url.searchParams.set("num", "10");

    const res = await fetchWithTimeout(url.toString());
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`SerpAPI error ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as any;
    const organic: any[] = data.organic_results ?? [];

    return organic.map((item) => ({
      url: item.link,
      title: item.title ?? "",
      snippet: item.snippet ?? "",
      domain: domainOf(item.link),
      imageUrl: item.thumbnail,
    }));
  },
};
