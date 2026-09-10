import type { ColumnMapping, FieldSpec } from "../types";

// ---------------------------------------------------------------------------
// Field specs per file kind (used to drive the mapping-confirmation UI and
// auto-detection). Order matters for display.
// ---------------------------------------------------------------------------

export const INV01_FIELDS: FieldSpec[] = [
  { key: "brand", label: "Brand", required: false, aliases: ["brand"] },
  { key: "department", label: "Department", required: false, aliases: ["department", "dept"] },
  { key: "category", label: "Category", required: true, aliases: ["category"] },
  { key: "itemCode", label: "Item Code", required: true, aliases: ["item code", "itemcode", "sku", "barcode"] },
  { key: "reference", label: "Reference", required: false, aliases: ["reference", "ref"] },
  { key: "itemDesc", label: "Item Desc", required: false, aliases: ["item desc", "description", "item description"] },
  { key: "season", label: "Season", required: false, aliases: ["season"] },
  { key: "product", label: "Product", required: false, aliases: ["product"] },
  { key: "productSubGroup", label: "Product Sub Group", required: false, aliases: ["product sub group", "sub group", "subgroup"] },
  { key: "ageingMths", label: "Ageing Mths", required: false, aliases: ["ageing mths", "ageing months", "aging"] },
  { key: "marketPrice", label: "Market Price", required: false, aliases: ["market price"] },
  { key: "itemCost", label: "Item Cost", required: false, aliases: ["item cost"] },
  { key: "margin", label: "Margin", required: false, aliases: ["margin"] },
];

export const SA79_FIELDS: FieldSpec[] = [
  { key: "transactionDate", label: "Transaction Date", required: true, aliases: ["transaction date", "date"] },
  { key: "storeName", label: "Store Name", required: true, aliases: ["store name", "store", "location"] },
  { key: "itemCode", label: "Item Code / Line (or Barcode)", required: true, aliases: ["item code", "item line", "barcode", "line", "sku"] },
  { key: "reference", label: "Reference", required: true, aliases: ["reference", "ref"] },
  { key: "season", label: "Season", required: false, aliases: ["season"] },
  { key: "category", label: "Category", required: false, aliases: ["category"] },
  { key: "itemSize", label: "Item Size", required: false, aliases: ["item size", "size"] },
  { key: "rtp", label: "RTP", required: false, aliases: ["rtp", "retail price"] },
  { key: "costPrice", label: "Cost Price", required: false, aliases: ["cost price"] },
  { key: "qty", label: "Qty", required: true, aliases: ["qty", "quantity"] },
  { key: "saleValue", label: "Sale Value", required: true, aliases: ["sale value", "sales value"] },
  { key: "costValue", label: "Cost Value", required: false, aliases: ["cost value"] },
];

export const ORDER_FIELDS: FieldSpec[] = [
  { key: "season", label: "Season", required: true, aliases: ["season"] },
  { key: "brand", label: "Brand", required: false, aliases: ["brand"] },
  { key: "line", label: "Line", required: false, aliases: ["line"] },
  { key: "colorCode", label: "Color Code", required: false, aliases: ["color code", "colour code", "color cd"] },
  { key: "colorName", label: "Color Name", required: false, aliases: ["color name", "colour name", "color desc"] },
  { key: "size", label: "Size", required: false, aliases: ["size"] },
  { key: "ean", label: "EAN/UPC (barcode — SKU key)", required: true, aliases: ["ean", "upc", "barcode"] },
  { key: "wholesalePrice", label: "Wholesale price (cost)", required: false, aliases: ["wholesale price", "wholesale"] },
  { key: "expectedDeliveryDate", label: "Expected delivery date", required: true, aliases: ["expected delivery date", "expected delivery", "delivery date"] },
  { key: "pendingUnitsQty", label: "pending Units QTY", required: true, aliases: ["pending units qty", "pending qty", "units qty"] },
  { key: "pendingUnitsValue", label: "pending Units value", required: false, aliases: ["pending units value", "units value"] },
  { key: "suggestedCategory", label: "HB_Warehouse_ProdGrp", required: false, aliases: ["hb_warehouse_prodgrp", "warehouse prodgrp", "prodgrp"] },
];

export const COLOUR_KEY_FIELDS: FieldSpec[] = [
  { key: "code", label: "Colour code (Row Labels)", required: true, aliases: ["row labels", "colour code", "color code", "code"] },
  { key: "name", label: "Colour name", required: true, aliases: ["color name", "colour name", "name"] },
];

// ---------------------------------------------------------------------------
// Auto-detection
// ---------------------------------------------------------------------------

function normalize(s: string): string {
  return s.toLowerCase().replace(/[_\-]/g, " ").replace(/\s+/g, " ").trim();
}

/** Guess a header-text mapping for each field spec against a list of actual headers. */
export function autoDetectMapping(headers: string[], fields: FieldSpec[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const usedHeaders = new Set<string>();
  const normHeaders = headers.map((h) => ({ raw: h, norm: normalize(h) }));

  for (const field of fields) {
    let best: { raw: string; score: number } | null = null;
    for (const h of normHeaders) {
      if (usedHeaders.has(h.raw)) continue;
      for (const alias of field.aliases) {
        const na = normalize(alias);
        let score = 0;
        if (h.norm === na) score = 100;
        else if (h.norm.includes(na)) score = 80 - Math.abs(h.norm.length - na.length);
        else if (na.includes(h.norm) && h.norm.length > 2) score = 60;
        if (score > 0 && (!best || score > best.score)) {
          best = { raw: h.raw, score };
        }
      }
    }
    mapping[field.key] = best ? best.raw : null;
    if (best) usedHeaders.add(best.raw);
  }
  return mapping;
}
