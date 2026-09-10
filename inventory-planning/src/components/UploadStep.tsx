import { useState } from "react";
import { useAppStore } from "../state/appStore";
import { FileDropzone } from "./FileDropzone";
import { loadColourKeyFile, loadInv01File, loadOrderFile, loadPreviousDecisions, loadSa79File } from "../lib/loadFile";

export function UploadStep() {
  const store = useAppStore();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function handle<T>(kind: string, fn: () => Promise<T>, apply: (v: T) => void) {
    setError(null);
    setBusy(kind);
    try {
      apply(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const ready = !!store.inv01File && !!store.sa79File && !!store.orderFile && !!store.colourKeyFile;

  return (
    <div className="panel">
      <h2>Step 1 — Upload files</h2>
      <p>
        Upload the four required files for this session. Nothing is saved anywhere — everything stays in your
        browser tab and is lost on refresh unless you download an export.
      </p>
      {error && <div className="warn-box">{error}</div>}

      <div className="grid-2">
        <FileDropzone
          label="INV01 (stock)"
          hint='Header row is auto-located by finding "Item Code".'
          required
          fileName={store.inv01File?.file.name ?? null}
          onFile={(f) => handle("inv01", () => loadInv01File(f), store.setInv01File)}
          onClear={() => store.setInv01File(null)}
        />
        <FileDropzone
          label="SA79 (sales)"
          hint="Combined file with all 3 locations — split by Store Name automatically."
          required
          fileName={store.sa79File?.file.name ?? null}
          onFile={(f) => handle("sa79", () => loadSa79File(f), store.setSa79File)}
          onClear={() => store.setSa79File(null)}
        />
        <FileDropzone
          label="Order on the way (incoming orders)"
          hint='Header row auto-located near row 4 by finding "Season" / "Expected delivery date".'
          required
          fileName={store.orderFile?.file.name ?? null}
          onFile={(f) => handle("order", () => loadOrderFile(f), store.setOrderFile)}
          onClear={() => store.setOrderFile(null)}
        />
        <FileDropzone
          label="Colour Key file"
          hint='2-column colour code → colour name lookup. Header row auto-located near row 3 ("Row Labels" / "Color name").'
          required
          fileName={store.colourKeyFile?.file.name ?? null}
          onFile={(f) => handle("colourKey", () => loadColourKeyFile(f), store.setColourKeyFile)}
          onClear={() => store.setColourKeyFile(null)}
        />
      </div>

      <hr style={{ margin: "18px 0", border: "none", borderTop: "1px solid var(--border)" }} />

      <FileDropzone
        label="Load previous category decisions (optional)"
        hint="A small Item Code | Category file you downloaded from a previous session. Pre-fills those SKUs so you're not re-asked."
        fileName={store.previousDecisionsFile?.file.name ?? null}
        onFile={(f) =>
          handle(
            "prevDecisions",
            async () => {
              const map = await loadPreviousDecisions(f);
              store.setPreviousDecisionsMap(map);
              return f;
            },
            (file) => store.setPreviousDecisionsFile({ file, grid: [], headerRowIndex: 0, preview: { headers: [], headerRowIndex: 0, rows: [], sampleRows: [] }, mapping: {} })
          )
        }
        onClear={() => {
          store.setPreviousDecisionsFile(null);
          store.setPreviousDecisionsMap(new Map());
        }}
      />
      {store.previousDecisionsMap.size > 0 && (
        <p className="muted">Loaded {store.previousDecisionsMap.size} previously-decided SKU categories.</p>
      )}

      <div className="actions-row">
        <button className="primary" disabled={!ready || !!busy} onClick={() => store.setStep("mapping")}>
          {busy ? "Loading…" : "Continue to column mapping →"}
        </button>
      </div>
    </div>
  );
}
