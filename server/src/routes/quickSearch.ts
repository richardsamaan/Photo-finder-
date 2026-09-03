import { Router } from "express";
import { quickImageSearch } from "../services/imageSearch.js";
import { ProviderNotConfiguredError } from "../services/searchProviders/types.js";

export const quickSearchRouter = Router();

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

quickSearchRouter.post("/", async (req, res) => {
  const { query, colourName, colourHex } = req.body ?? {};

  if (typeof query !== "string" || !query.trim()) {
    return res.status(400).json({ error: "query is required." });
  }
  if (colourHex !== undefined && colourHex !== null && colourHex !== "") {
    if (typeof colourHex !== "string" || !HEX_RE.test(colourHex.trim())) {
      return res.status(400).json({ error: "colourHex must be a hex code like #1A1A1A." });
    }
  }

  try {
    const results = await quickImageSearch({
      query: query.trim(),
      colourName: typeof colourName === "string" && colourName.trim() ? colourName.trim() : undefined,
      colourHex: typeof colourHex === "string" && colourHex.trim() ? colourHex.trim() : undefined,
    });
    res.json({ results });
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      return res.status(400).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Search failed." });
  }
});
