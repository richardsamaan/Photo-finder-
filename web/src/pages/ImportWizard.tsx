import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type ImportUploadResponse, type ImportPreviewResponse } from "../api/client";

type Step = "upload" | "mapping";

export function ImportWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("upload");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [imported, setImported] = useState<ImportUploadResponse | null>(null);
  const [mapping, setMapping] = useState({ styleCode: "", colour: "", category: "" });
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const res = await api.uploadImport(file);
      setImported(res);
      setMapping({
        styleCode: res.mapping.styleCode ?? "",
        colour: res.mapping.colour ?? "",
        category: res.mapping.category ?? "",
      });
      setStep("mapping");
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }, []);

  useEffect(() => {
    if (!imported || !mapping.styleCode || !mapping.colour || !mapping.category) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    const t = setTimeout(() => {
      api
        .previewImportMapping(imported.token, mapping)
        .then((r) => !cancelled && setPreview(r))
        .catch(() => !cancelled && setPreview(null))
        .finally(() => !cancelled && setPreviewLoading(false));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [imported, mapping]);

  async function handleCancel() {
    if (imported) await api.cancelImport(imported.token).catch(() => {});
    setImported(null);
    setPreview(null);
    setStep("upload");
  }

  async function handleConfirm() {
    if (!imported) return;
    setConfirming(true);
    try {
      const res = await api.confirmImport(imported.token, mapping);
      navigate(`/jobs/${res.jobId}`);
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Import failed.");
    } finally {
      setConfirming(false);
    }
  }

  if (step === "upload") {
    return (
      <div className="max-w-xl mx-auto flex flex-col gap-4">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Upload Product List</h1>
        <p className="text-sm text-slate-500">
          Upload an Excel (.xlsx/.xls) or CSV file containing Style Code, Colour, and Category columns.
        </p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`card border-2 border-dashed p-10 text-center cursor-pointer transition ${
            dragOver ? "border-brand-500 bg-brand-50" : "border-slate-300"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <p className="text-4xl mb-3">📤</p>
          {uploading ? (
            <p className="text-slate-500">Uploading and parsing…</p>
          ) : (
            <>
              <p className="font-medium text-slate-700">Tap to choose a file, or drag &amp; drop</p>
              <p className="text-xs text-slate-400 mt-1">.xlsx, .xls, or .csv</p>
            </>
          )}
        </div>

        {uploadError && <div className="text-red-600 text-sm">{uploadError}</div>}
      </div>
    );
  }

  const headers = imported?.headers ?? [];
  const totalRows = preview?.totalRows ?? imported?.totalRows ?? 0;
  const validRows = preview?.validRows ?? 0;
  const totalCategories = preview?.totalCategories ?? 0;
  const previewRows = preview?.preview ?? imported?.preview ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Map Columns &amp; Preview</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          File: <span className="font-medium text-slate-700">{imported?.filename}</span>
        </p>
      </div>

      <div className="card p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {(["styleCode", "colour", "category"] as const).map((field) => (
          <label key={field} className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-slate-700 capitalize">
              {field === "styleCode" ? "Style Code" : field}
            </span>
            <select
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm bg-white"
              value={mapping[field]}
              onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value }))}
            >
              <option value="">— Select column —</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {!imported?.mapping.confident && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3">
          We couldn't confidently auto-detect all columns — please confirm the mapping above.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card p-3 sm:p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Total Products</div>
          <div className="text-2xl font-bold text-slate-900">{validRows || totalRows}</div>
        </div>
        <div className="card p-3 sm:p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Total Categories</div>
          <div className="text-2xl font-bold text-slate-900">{totalCategories}</div>
        </div>
        {preview && preview.invalidRows > 0 && (
          <div className="card p-3 sm:p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Skipped (blank)</div>
            <div className="text-2xl font-bold text-amber-600">{preview.invalidRows}</div>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 font-medium text-sm text-slate-700">
          Preview {previewLoading && <span className="text-slate-400">(updating…)</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Style Code</th>
                <th className="text-left px-4 py-2 font-medium">Colour</th>
                <th className="text-left px-4 py-2 font-medium">Category</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {previewRows.map((row, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 whitespace-nowrap">{row.styleCode || <em className="text-slate-300">—</em>}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{row.colour || <em className="text-slate-300">—</em>}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{row.category || <em className="text-slate-300">—</em>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalRows > previewRows.length && (
          <div className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100">
            Showing first {previewRows.length} of {totalRows} rows.
          </div>
        )}
      </div>

      {uploadError && <div className="text-red-600 text-sm">{uploadError}</div>}

      <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end pb-4">
        <button className="btn-secondary" onClick={handleCancel}>
          Cancel
        </button>
        <button
          className="btn-primary"
          disabled={!mapping.styleCode || !mapping.colour || !mapping.category || validRows === 0 || confirming}
          onClick={handleConfirm}
        >
          {confirming ? "Importing…" : `Confirm Import (${validRows || totalRows} products)`}
        </button>
      </div>
    </div>
  );
}
