import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// ProcessingJobs: one row per uploaded file import / search run
export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(),
  status: text("status", {
    enum: ["draft", "pending", "running", "paused", "completed", "cancelled", "failed"],
  })
    .notNull()
    .default("draft"),
  columnMapping: text("column_mapping"), // JSON: {styleCode, colour, category, season}
  totalProducts: integer("total_products").notNull().default(0),
  processedProducts: integer("processed_products").notNull().default(0),
  concurrency: integer("concurrency").notNull().default(3),
  // Source-domain restriction for search results - see services/sourceTier.ts.
  domainFilterMode: text("domain_filter_mode", {
    enum: ["none", "official_only", "official_plus_allowlist"],
  })
    .notNull()
    .default("none"),
  officialDomain: text("official_domain"), // e.g. "hugoboss.com" - required when domainFilterMode != "none"
  // Set when a running job stops itself rather than being paused by a user.
  pauseReason: text("pause_reason", { enum: ["user", "quota_reached"] }),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
});

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    jobId: text("job_id").notNull(),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => ({
    uniqByJob: uniqueIndex("categories_job_name_idx").on(t.jobId, t.name),
  })
);

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id").notNull(),
    rowNumber: integer("row_number").notNull(),
    styleCode: text("style_code").notNull(),
    colour: text("colour").notNull(),
    category: text("category").notNull(),
    season: text("season"),
    // Highest escalating search phase this product has completed (0 = not yet
    // attempted). See services/phaseEngine.ts for the phase state machine.
    searchPhase: integer("search_phase").notNull().default(0),
    status: text("status", {
      enum: [
        "pending",
        "queued",
        "searching",
        "high_confidence",
        "medium_confidence",
        "needs_review",
        "not_found",
        "approved",
        "rejected",
        "failed",
      ],
    })
      .notNull()
      .default("pending"),
    confidence: integer("confidence").notNull().default(0),
    imageUrl: text("image_url"),
    sourceUrl: text("source_url"),
    sourceName: text("source_name"),
    localImagePath: text("local_image_path"),
    filename: text("filename"),
    verificationNotes: text("verification_notes"), // JSON array of evidence strings
    errorMessage: text("error_message"),
    attempts: integer("attempts").notNull().default(0),
    manuallyUploaded: integer("manually_uploaded", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
    updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => ({
    jobIdx: index("products_job_idx").on(t.jobId),
    statusIdx: index("products_status_idx").on(t.jobId, t.status),
    styleColourIdx: index("products_style_colour_idx").on(t.styleCode, t.colour),
  })
);

// Candidate search results found for a product before one is chosen
export const searchResults = sqliteTable(
  "search_results",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    provider: text("provider").notNull(),
    query: text("query").notNull(),
    url: text("url").notNull(),
    title: text("title"),
    snippet: text("snippet"),
    domain: text("domain").notNull(),
    imageUrl: text("image_url"),
    styleCodeMatch: integer("style_code_match", { mode: "boolean" }).notNull().default(false),
    colourMatch: integer("colour_match", { mode: "boolean" }).notNull().default(false),
    categoryMatch: integer("category_match", { mode: "boolean" }).notNull().default(false),
    sourceTier: text("source_tier", {
      enum: ["official_brand", "authorized_retailer", "reliable_retailer", "other", "unknown"],
    })
      .notNull()
      .default("unknown"),
    confidence: integer("confidence").notNull().default(0),
    evidence: text("evidence"), // JSON array of strings explaining the score
    chosen: integer("chosen", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => ({
    productIdx: index("search_results_product_idx").on(t.productId),
  })
);

export const images = sqliteTable(
  "images",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    searchResultId: text("search_result_id"),
    sourceUrl: text("source_url").notNull(),
    localPath: text("local_path"),
    width: integer("width"),
    height: integer("height"),
    verified: integer("verified", { mode: "boolean" }).notNull().default(false),
    chosen: integer("chosen", { mode: "boolean" }).notNull().default(false),
    uploadedManually: integer("uploaded_manually", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => ({
    productIdx: index("images_product_idx").on(t.productId),
  })
);

export const sources = sqliteTable(
  "sources",
  {
    id: text("id").primaryKey(),
    domain: text("domain").notNull().unique(),
    tier: text("tier", {
      enum: ["official_brand", "authorized_retailer", "reliable_retailer", "other", "unknown"],
    })
      .notNull()
      .default("unknown"),
    trustScore: integer("trust_score").notNull().default(50),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  }
);

export const searchHistory = sqliteTable(
  "search_history",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    query: text("query").notNull(),
    provider: text("provider").notNull(),
    resultCount: integer("result_count").notNull().default(0),
    success: integer("success", { mode: "boolean" }).notNull().default(true),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => ({
    productIdx: index("search_history_product_idx").on(t.productId),
  })
);

// Persistent cache keyed by styleCode+colour so repeat uploads can reuse prior work
export const searchCache = sqliteTable(
  "search_cache",
  {
    id: text("id").primaryKey(),
    cacheKey: text("cache_key").notNull().unique(), // normalized styleCode|colour
    styleCode: text("style_code").notNull(),
    colour: text("colour").notNull(),
    status: text("status").notNull(),
    confidence: integer("confidence").notNull().default(0),
    imageUrl: text("image_url"),
    sourceUrl: text("source_url"),
    sourceName: text("source_name"),
    resultsJson: text("results_json"), // full serialized candidate list
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
    updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
  }
);

// Single-row (id: "singleton") persisted counter for the rolling 24h
// search-provider quota window - see services/quotaGovernor.ts.
export const searchQuota = sqliteTable("search_quota", {
  id: text("id").primaryKey(),
  windowStart: text("window_start").notNull(),
  count: integer("count").notNull().default(0),
});
