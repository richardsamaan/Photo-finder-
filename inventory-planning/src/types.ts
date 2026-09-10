// Core domain types for the Inventory Planning app (Phase 1).

export type LocationId = "boss_boutique" | "jds_bcc" | "jds_al_aali";

export interface LocationMeta {
  id: LocationId;
  label: string;
  /** Text that identifies this location in source files (Store Name column, INV01 stock-pair header row, etc). */
  sourceLabel: string;
}

export const LOCATIONS: LocationMeta[] = [
  {
    id: "boss_boutique",
    label: "Boss Boutique — City Centre",
    sourceLabel: "HUGO BOSS BAHRAIN CITY CENTRE",
  },
  {
    id: "jds_bcc",
    label: "JDS counter — City Centre / BCC",
    sourceLabel: "JNS DEPARTMENT STORE - BCC",
  },
  {
    id: "jds_al_aali",
    label: "JDS counter — Al Aali Mall",
    sourceLabel: "JNS DEPARTMENT STORE - AL AALI MALL",
  },
];

export const COMBINED = "combined" as const;
export type ViewScope = LocationId | typeof COMBINED;

export function viewScopes(): { id: ViewScope; label: string }[] {
  return [
    { id: COMBINED, label: "Combined (whole business)" },
    ...LOCATIONS.map((l) => ({ id: l.id, label: l.label })),
  ];
}

// ---------------------------------------------------------------------------
// File kinds
// ---------------------------------------------------------------------------

export type FileKind = "inv01" | "sa79" | "orderOnTheWay" | "colourKey" | "categoryDecisions";

// ---------------------------------------------------------------------------
// Parsed row shapes (post column-mapping, pre report computation)
// ---------------------------------------------------------------------------

export interface Inv01Row {
  itemCode: string;
  brand: string;
  department: string;
  category: string;
  reference: string;
  itemDesc: string;
  season: string;
  product: string;
  productSubGroup: string;
  ageingMths: number | null;
  marketPrice: number | null;
  itemCost: number | null;
  margin: number | null;
  /** Stock per location, keyed by LocationId. */
  stock: Partial<Record<LocationId, { curStk: number; curStkCost: number }>>;
}

export interface Sa79Row {
  transactionDate: Date | null;
  storeName: string;
  location: LocationId | null;
  itemCode: string;
  reference: string;
  season: string;
  category: string;
  itemSize: string;
  rtp: number | null;
  costPrice: number | null;
  qty: number;
  saleValue: number;
  costValue: number;
  /** Parsed from Reference (Style-ColourCode-Size). */
  colourCode: string | null;
  colourName: string | null;
  styleCode: string | null;
}

export interface OrderRow {
  season: string;
  brand: string;
  line: string; // EAN/UPC barcode - SKU matching key
  colorCode: string;
  colorName: string;
  size: string;
  wholesalePrice: number | null;
  expectedDeliveryDate: Date | null;
  pendingUnitsQty: number;
  pendingUnitsValue: number;
  suggestedCategory: string; // HB_Warehouse_ProdGrp
}

export interface ColourKeyEntry {
  code: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Category resolution
// ---------------------------------------------------------------------------

export interface CategoryConflict {
  itemCode: string;
  candidates: { source: string; category: string }[];
}

export interface CategoryDecision {
  itemCode: string;
  category: string;
  /** true if a human explicitly chose/confirmed this (vs. an uncontested single-source value). */
  manual: boolean;
}

// ---------------------------------------------------------------------------
// Column mapping
// ---------------------------------------------------------------------------

export interface FieldSpec {
  key: string;
  label: string;
  required: boolean;
  aliases: string[]; // lowercase header fragments used for auto-detection
}

export interface SheetPreview {
  headers: string[];
  headerRowIndex: number;
  rows: Record<string, unknown>[]; // keyed by header text
  sampleRows: Record<string, unknown>[]; // first few rows for preview
}

export type ColumnMapping = Record<string, string | null>; // fieldKey -> header text (or null if unmapped)

// ---------------------------------------------------------------------------
// Forecasting
// ---------------------------------------------------------------------------

export type ForecastMethod = "avg12" | "yoy" | "trailing3" | "seasonality";

export const FORECAST_METHODS: { id: ForecastMethod; label: string; explanation: string }[] = [
  {
    id: "avg12",
    label: "Average /12",
    explanation: "Spreads last year's total sales evenly across every month.",
  },
  {
    id: "yoy",
    label: "Year-over-year (YoY)",
    explanation: "Uses what actually sold in these same months last year.",
  },
  {
    id: "trailing3",
    label: "Trailing 3-month",
    explanation:
      "Uses only the most recent 3 months' pace — reacts fastest to a current trend, but can miss an upcoming seasonal shift.",
  },
  {
    id: "seasonality",
    label: "Seasonality-adjusted",
    explanation: "Weights the forecast by how strong each specific month usually is, not just a flat average.",
  },
];

export interface MonthlyPoint {
  /** "YYYY-MM" */
  key: string;
  year: number;
  month: number; // 1-12
  qty: number;
  saleValue: number;
  costValue: number;
}
