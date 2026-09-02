import { useState } from "react";
import { api, type CollectionSummary } from "../api/client";

export function CollectionsManager({
  collections,
  onClose,
  onChanged,
}: {
  collections: CollectionSummary[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    if (!newName.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.createCollection(newName.trim());
      setNewName("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the collection.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRename(id: string) {
    if (!renameValue.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateCollection(id, { name: renameValue.trim() });
      setRenamingId(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rename the collection.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteCollection(id);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the collection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40" onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Collections</h2>
          <button className="text-sm text-slate-500" onClick={onClose}>
            Done
          </button>
        </div>

        {collections.length === 0 && (
          <p className="text-sm text-slate-500">You don't have any collections yet.</p>
        )}

        <div className="space-y-2">
          {collections.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5">
              {renamingId === c.id ? (
                <>
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleRename(c.id)}
                    className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <button className="text-sm text-brand-700 font-medium" disabled={busy} onClick={() => handleRename(c.id)}>
                    Save
                  </button>
                </>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{c.name}</p>
                    <p className="text-xs text-slate-400">{c.wordCount} words</p>
                  </div>
                  <button
                    className="text-sm text-slate-500"
                    disabled={busy}
                    onClick={() => {
                      setRenamingId(c.id);
                      setRenameValue(c.name);
                    }}
                  >
                    Rename
                  </button>
                  <button className="text-sm text-red-600" disabled={busy} onClick={() => handleDelete(c.id)}>
                    Delete
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-2 border-t border-slate-100">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="New collection name"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
          />
          <button className="btn-primary text-sm" disabled={busy} onClick={handleCreate}>
            Create
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
