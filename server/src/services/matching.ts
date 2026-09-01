// Text-evidence matching helpers used by the verification/confidence engine.
// Kept deliberately conservative: a match must be a real token match, never
// a fuzzy "looks similar" guess.

const COLOUR_SYNONYMS: Record<string, string[]> = {
  grey: ["gray"],
  gray: ["grey"],
  navy: ["navy blue"],
  black: [],
  white: ["off white", "off-white"],
  red: [],
  blue: [],
  green: [],
  yellow: [],
  pink: [],
  purple: [],
  orange: [],
  brown: ["tan", "camel"],
  beige: ["stone", "sand"],
  cream: ["ivory"],
  khaki: ["olive"],
  multi: ["multicolour", "multicolor", "multi-colour", "multi-color"],
};

const CATEGORY_SYNONYMS: Record<string, string[]> = {
  "t-shirt": ["tshirt", "tee", "t shirt"],
  shirt: ["shirts"],
  trousers: ["pants", "trouser"],
  jacket: ["jackets", "coat"],
  jeans: ["denim"],
  jumper: ["sweater", "pullover"],
  hoodie: ["hooded sweatshirt"],
  dress: ["dresses"],
  shoes: ["footwear", "trainers", "sneakers"],
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function normalizeCode(s: string): string {
  return normalize(s).replace(/[^a-z0-9]/g, "");
}

/**
 * Does `text` contain the style code as a genuine token (not just a
 * substring of a longer, unrelated number)? We strip separators from both
 * sides and require the code to appear as a contiguous digit/alnum run in
 * the stripped text, bounded by non-alphanumeric characters or string edges
 * in the ORIGINAL text at at least one plausible tokenization.
 */
export function textContainsStyleCode(text: string, styleCode: string): boolean {
  const code = normalizeCode(styleCode);
  if (!code || code.length < 3) return false;

  // Direct token search in the original text (handles "50512345" surrounded
  // by spaces/punctuation/word boundaries).
  const escaped = styleCode.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const boundaryRe = new RegExp(`(?<![a-zA-Z0-9])${escaped}(?![a-zA-Z0-9])`, "i");
  if (boundaryRe.test(text)) return true;

  // Fallback 1: normalize both sides (strips spaces/dashes/slashes that
  // sites sometimes insert into SKUs, e.g. "5051-2345" or "5051 2345")
  // and require the whole normalized code to appear as one token.
  const normalizedText = text.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  if (normalizedText.split(" ").some((t) => t === code)) return true;

  // Fallback 2: allow a single separator character between each digit of
  // the code (handles "5051-2345" style formatting the site applies to the
  // SKU itself), still bounded so it can't match inside an unrelated longer
  // number.
  const spaced = code.split("").join("[\\s-]?");
  const flexibleRe = new RegExp(`(?<![a-zA-Z0-9])${spaced}(?![a-zA-Z0-9])`, "i");
  return flexibleRe.test(text);
}

export function textContainsColour(text: string, colour: string): boolean {
  const t = normalize(text);
  const c = normalize(colour);
  if (!c) return false;

  const variants = [c, ...(COLOUR_SYNONYMS[c] ?? [])];
  // also check if any known synonym key maps back to c (reverse lookup)
  for (const [key, syns] of Object.entries(COLOUR_SYNONYMS)) {
    if (syns.includes(c)) variants.push(key);
  }

  return variants.some((v) => new RegExp(`\\b${escapeRe(v)}\\b`, "i").test(t));
}

export function textContainsCategory(text: string, category: string): boolean {
  const t = normalize(text);
  const c = normalize(category);
  if (!c) return false;

  const variants = [c, ...(CATEGORY_SYNONYMS[c] ?? [])];
  for (const [key, syns] of Object.entries(CATEGORY_SYNONYMS)) {
    if (syns.includes(c)) variants.push(key);
  }
  // Also try singular form (strip trailing 's')
  if (c.endsWith("s")) variants.push(c.slice(0, -1));

  return variants.some((v) => new RegExp(`\\b${escapeRe(v)}`, "i").test(t));
}

/** Detects when the text clearly states a DIFFERENT colour than requested
 * (e.g. product title says "Navy" but we want "Black") - used to apply a
 * strong penalty rather than just "no match found". */
export function textContainsConflictingColour(text: string, colour: string): boolean {
  const known = Object.keys(COLOUR_SYNONYMS);
  const requested = normalize(colour);
  for (const candidate of known) {
    if (candidate === requested) continue;
    if (new RegExp(`\\b${escapeRe(candidate)}\\b`, "i").test(text)) {
      // Only flag as conflicting if the requested colour is truly absent
      if (!textContainsColour(text, colour)) return true;
    }
  }
  return false;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
