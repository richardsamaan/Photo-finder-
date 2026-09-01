import { env } from "../../env.js";
import { domainOf, fetchWithTimeout } from "../../lib/httpFetch.js";
import type { RawSearchResult, SearchProvider } from "./types.js";

// Firecrawl - search + scrape. https://docs.firecrawl.dev/
export const firecrawlProvider: SearchProvider = {
  name: "firecrawl",

  isConfigured() {
    return Boolean(env.FIRECRAWL_API_KEY);
  },

  async search(query: string): Promise<RawSearchResult[]> {
    if (!this.isConfigured()) return [];
    const res = await fetchWithTimeout("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, limit: 10 }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Firecrawl search error ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as any;
    const items: any[] = data.data ?? [];

    return items.map((item) => ({
      url: item.url,
      title: item.title ?? "",
      snippet: item.description ?? "",
      domain: domainOf(item.url),
      imageUrl: undefined,
    }));
  },

  async fetchPageContent(url: string) {
    if (!this.isConfigured()) return null;
    const res = await fetchWithTimeout("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, formats: ["markdown", "links"], onlyMainContent: true }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const markdown: string = data.data?.markdown ?? "";
    const images: string[] = (data.data?.markdown?.match(/!\[[^\]]*\]\((https?:[^\s)]+)\)/g) ?? [])
      .map((m: string) => {
        const match = m.match(/\((https?:[^\s)]+)\)/);
        return match ? match[1] : "";
      })
      .filter(Boolean);
    return { text: markdown, images };
  },
};
