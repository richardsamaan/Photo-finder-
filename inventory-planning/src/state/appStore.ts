import { create } from "zustand";
import type {
  ColourKeyEntry,
  ColumnMapping,
  ForecastMethod,
  Inv01Row,
  LocationId,
  OrderRow,
  Sa79Row,
  SheetPreview,
  ViewScope,
} from "../types";
import { COMBINED } from "../types";
import type { StockColumnPair } from "../lib/inv01LocationColumns";

export type WizardStep = "upload" | "mapping" | "categories" | "reports";

export interface LoadedFile {
  file: File;
  grid: unknown[][];
  headerRowIndex: number;
  preview: SheetPreview;
  mapping: ColumnMapping;
}

export interface Inv01LoadedFile extends LoadedFile {
  stockPairs: StockColumnPair[];
  pairLocationOverride: Record<number, LocationId | null>; // columnIndex -> chosen location
}

interface AppState {
  step: WizardStep;
  setStep: (s: WizardStep) => void;

  inv01File: Inv01LoadedFile | null;
  sa79File: LoadedFile | null;
  orderFile: LoadedFile | null;
  colourKeyFile: LoadedFile | null;
  previousDecisionsFile: LoadedFile | null;

  setInv01File: (f: Inv01LoadedFile | null) => void;
  setSa79File: (f: LoadedFile | null) => void;
  setOrderFile: (f: LoadedFile | null) => void;
  setColourKeyFile: (f: LoadedFile | null) => void;
  setPreviousDecisionsFile: (f: LoadedFile | null) => void;

  updateInv01Mapping: (mapping: ColumnMapping) => void;
  updateSa79Mapping: (mapping: ColumnMapping) => void;
  updateOrderMapping: (mapping: ColumnMapping) => void;
  updateColourKeyMapping: (mapping: ColumnMapping) => void;
  setInv01PairLocation: (columnIndex: number, location: LocationId | null) => void;

  seasonDateOverrides: Record<string, string>; // season -> "YYYY-MM-DD" or ""
  setSeasonDateOverride: (season: string, value: string) => void;

  inv01Rows: Inv01Row[];
  sa79Rows: Sa79Row[];
  orderRows: OrderRow[];
  colourKeyEntries: ColourKeyEntry[];
  setParsed: (v: { inv01: Inv01Row[]; sa79: Sa79Row[]; orders: OrderRow[]; colourKey: ColourKeyEntry[] }) => void;

  manualOverrides: Map<string, string>;
  setManualOverride: (itemCode: string, category: string) => void;
  setManualOverrides: (entries: [string, string][]) => void;
  previousDecisionsMap: Map<string, string>;
  setPreviousDecisionsMap: (m: Map<string, string>) => void;

  scope: ViewScope;
  setScope: (s: ViewScope) => void;
  forecastMethod: ForecastMethod;
  setForecastMethod: (m: ForecastMethod) => void;

  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  step: "upload",
  setStep: (s) => set({ step: s }),

  inv01File: null,
  sa79File: null,
  orderFile: null,
  colourKeyFile: null,
  previousDecisionsFile: null,

  setInv01File: (f) => set({ inv01File: f }),
  setSa79File: (f) => set({ sa79File: f }),
  setOrderFile: (f) => set({ orderFile: f }),
  setColourKeyFile: (f) => set({ colourKeyFile: f }),
  setPreviousDecisionsFile: (f) => set({ previousDecisionsFile: f }),

  updateInv01Mapping: (mapping) =>
    set((state) => (state.inv01File ? { inv01File: { ...state.inv01File, mapping } } : {})),
  updateSa79Mapping: (mapping) => set((state) => (state.sa79File ? { sa79File: { ...state.sa79File, mapping } } : {})),
  updateOrderMapping: (mapping) => set((state) => (state.orderFile ? { orderFile: { ...state.orderFile, mapping } } : {})),
  updateColourKeyMapping: (mapping) =>
    set((state) => (state.colourKeyFile ? { colourKeyFile: { ...state.colourKeyFile, mapping } } : {})),
  setInv01PairLocation: (columnIndex, location) =>
    set((state) => {
      if (!state.inv01File) return {};
      return {
        inv01File: {
          ...state.inv01File,
          pairLocationOverride: { ...state.inv01File.pairLocationOverride, [columnIndex]: location },
        },
      };
    }),

  seasonDateOverrides: {},
  setSeasonDateOverride: (season, value) =>
    set((state) => ({ seasonDateOverrides: { ...state.seasonDateOverrides, [season]: value } })),

  inv01Rows: [],
  sa79Rows: [],
  orderRows: [],
  colourKeyEntries: [],
  setParsed: (v) => set({ inv01Rows: v.inv01, sa79Rows: v.sa79, orderRows: v.orders, colourKeyEntries: v.colourKey }),

  manualOverrides: new Map(),
  setManualOverride: (itemCode, category) =>
    set((state) => {
      const next = new Map(state.manualOverrides);
      next.set(itemCode, category);
      return { manualOverrides: next };
    }),
  setManualOverrides: (entries) =>
    set((state) => {
      const next = new Map(state.manualOverrides);
      for (const [itemCode, category] of entries) next.set(itemCode, category);
      return { manualOverrides: next };
    }),
  previousDecisionsMap: new Map(),
  setPreviousDecisionsMap: (m) => set({ previousDecisionsMap: m }),

  scope: COMBINED,
  setScope: (s) => set({ scope: s }),
  forecastMethod: "avg12",
  setForecastMethod: (m) => set({ forecastMethod: m }),

  reset: () =>
    set({
      step: "upload",
      inv01File: null,
      sa79File: null,
      orderFile: null,
      colourKeyFile: null,
      previousDecisionsFile: null,
      seasonDateOverrides: {},
      inv01Rows: [],
      sa79Rows: [],
      orderRows: [],
      colourKeyEntries: [],
      manualOverrides: new Map(),
      previousDecisionsMap: new Map(),
    }),
}));
