// Heuristic domain trust classification. The uploaded product list has no
// brand column, so we cannot know a given product's "official" domain in
// advance - instead we maintain a curated allowlist of known legitimate
// fashion marketplaces/retailers (extend RELIABLE_RETAILERS as needed) and
// fall back to signal words ("official store", "shop.<brand>.com" patterns)
// for brand-site detection. Anything not recognized is tier "other" and
// scored lower, never rejected outright - the user reviews it either way.

export type SourceTier =
  | "official_brand"
  | "authorized_retailer"
  | "reliable_retailer"
  | "other"
  | "unknown";

const RELIABLE_RETAILERS = new Set([
  "asos.com",
  "zalando.com",
  "zalando.co.uk",
  "next.co.uk",
  "next.com",
  "johnlewis.com",
  "marksandspencer.com",
  "houseoffraser.co.uk",
  "very.co.uk",
  "jdsports.co.uk",
  "jdsports.com",
  "endclothing.com",
  "size.co.uk",
  "schuh.co.uk",
  "matchesfashion.com",
  "farfetch.com",
  "net-a-porter.com",
  "mrporter.com",
  "selfridges.com",
  "harrods.com",
  "amazon.com",
  "amazon.co.uk",
  "boohoo.com",
  "prettylittlething.com",
  "riverisland.com",
  "topshop.com",
  "urbanoutfitters.com",
  "zara.com",
  "hm.com",
  "uniqlo.com",
  "nordstrom.com",
  "macys.com",
  "debenhams.com",
]);

const OFFICIAL_BRAND_HINTS = [/^shop\./, /^store\./, /^www\.official/];

export function classifySourceTier(domain: string, pageText = ""): SourceTier {
  const d = domain.toLowerCase();

  if (RELIABLE_RETAILERS.has(d)) return "reliable_retailer";

  if (OFFICIAL_BRAND_HINTS.some((re) => re.test(d))) return "official_brand";

  const lowerText = pageText.toLowerCase();
  if (
    lowerText.includes("official website") ||
    lowerText.includes("official online store") ||
    lowerText.includes("official store")
  ) {
    return "official_brand";
  }

  // Large generic marketplaces where third parties can list - still legitimate
  // but less trustworthy for exact-match verification than a single-brand site.
  if (d.includes("ebay.") || d.includes("etsy.") || d.includes("aliexpress.")) {
    return "other";
  }

  return "unknown";
}

export function trustScoreForTier(tier: SourceTier): number {
  switch (tier) {
    case "official_brand":
      return 100;
    case "authorized_retailer":
      return 85;
    case "reliable_retailer":
      return 75;
    case "other":
      return 40;
    default:
      return 55;
  }
}

// --- Optional per-job source-domain restriction ---
// "none" preserves the original unrestricted behaviour (any source that
// passes style-code/colour/category verification); the other two modes
// narrow the candidate pool itself, before verification ever runs.

export type DomainFilterMode = "none" | "official_only" | "official_plus_allowlist";

export function domainMatchesOfficial(domain: string, officialDomain: string): boolean {
  const d = domain.toLowerCase().replace(/^www\./, "");
  const o = officialDomain.trim().toLowerCase().replace(/^www\./, "");
  if (!o) return false;
  return d === o || d.endsWith(`.${o}`);
}

export function isDomainAllowed(
  domain: string,
  mode: DomainFilterMode,
  officialDomain: string | null | undefined
): boolean {
  if (mode === "none") return true;

  const isOfficial = Boolean(officialDomain) && domainMatchesOfficial(domain, officialDomain!);
  if (mode === "official_only") return isOfficial;

  // official_plus_allowlist
  return isOfficial || RELIABLE_RETAILERS.has(domain.toLowerCase());
}
