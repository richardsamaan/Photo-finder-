import { env } from "../../env.js";
import { domainOf, fetchWithTimeout } from "../../lib/httpFetch.js";
import type { RawSearchResult, SearchProvider } from "./types.js";
import type { RawImageResult } from "./imageTypes.js";

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

/**
 * Bing Image Search API (v7). Returns real image width/height, so callers
 * can skip a dimension probe for these results. Used only by the
 * quick-search tool.
 */
export async function searchImages(query: string): Promise<RawImageResult[]> {
  if (!bingProvider.isConfigured()) return [];
  const url = new URL("https://api.bing.microsoft.com/v7.0/images/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "10");
  url.searchParams.set("safeSearch", "Moderate");

  const res = await fetchWithTimeout(url.toString(), {
    headers: { "Ocp-Apim-Subscription-Key": env.BING_API_KEY },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as any;
  const items: any[] = data.value ?? [];

  return items
    .filter((item) => item.contentUrl)
    .map((item) => {
      const sourceUrl = item.hostPageUrl ?? item.contentUrl;
      return {
        imageUrl: item.contentUrl,
        sourceUrl,
        title: item.name ?? "",
        domain: domainOf(sourceUrl),
        width: item.width,
        height: item.height,
      } satisfies RawImageResult;
    });
}
