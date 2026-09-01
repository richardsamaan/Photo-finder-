import { env } from "../../env.js";
import { domainOf, fetchWithTimeout } from "../../lib/httpFetch.js";
import type { RawSearchResult, SearchProvider } from "./types.js";

// Bing Web Search API (Azure Cognitive Services)
export const bingProvider: SearchProvider = {
  name: "bing",

  isConfigured() {
    return Boolean(env.BING_API_KEY);
  },

  async search(query: string): Promise<RawSearchResult[]> {
    if (!this.isConfigured()) return [];
    const url = new URL("https://api.bing.microsoft.com/v7.0/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", "10");

    const res = await fetchWithTimeout(url.toString(), {
      headers: { "Ocp-Apim-Subscription-Key": env.BING_API_KEY },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Bing Search error ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as any;
    const items: any[] = data.webPages?.value ?? [];

    return items.map((item) => ({
      url: item.url,
      title: item.name ?? "",
      snippet: item.snippet ?? "",
      domain: domainOf(item.url),
      imageUrl: undefined,
    }));
  },
};
