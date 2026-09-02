import { useCallback, useEffect, useState } from "react";
import {
  api,
  type VocabularyListItem,
  type VocabularyListParams,
  type VocabularyStatus,
  type VocabularySummary,
  type SortKey,
  type CollectionSummary,
} from "../api/client";
import { StatTile } from "../components/StatTile";
import { WordCard } from "../components/WordCard";
import { EmptyState } from "../components/EmptyState";
import { CollectionsManager } from "../components/CollectionsManager";

type FilterValue = "all" | VocabularyStatus | "needs_review" | "known_before_app" | "learned_through_app";

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "learning", label: "Learning" },
  { value: "familiar", label: "Familiar" },
  { value: "mastered", label: "Mastered" },
  { value: "needs_review", label: "Needs Review" },
  { value: "known_before_app", label: "Known Before App" },
  { value: "learned_through_app", label: "Learned Through App" },
];

const SORTS: { value: SortKey; label: string }[] = [
  { value: "recent", label: "Recently added" },
  { value: "reviewed", label: "Recently reviewed" },
  { value: "nextReview", label: "Next review" },
  { value: "mastery", label: "Mastery" },
  { value: "alphabetical", label: "Alphabetical" },
  { value: "difficult", label: "Most difficult" },
  { value: "forgotten", label: "Frequently forgotten" },
];

const PAGE_SIZE = 20;

export function MyVocabulary() {
  const [summary, setSummary] = useState<VocabularySummary | null>(null);
  const [items, setItems] = useState<VocabularyListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [showCollections, setShowCollections] = useState(false);

  const [addingWord, setAddingWord] = useState(false);
  const [newWord, setNewWord] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const loadSummary = useCallback(() => {
    api.getVocabularySummary().then(setSummary).catch(() => {});
  }, []);

  const loadCollections = useCallback(() => {
    api.listCollections().then(setCollections).catch(() => {});
  }, []);

  useEffect(() => {
    loadSummary();
    loadCollections();
  }, [loadSummary, loadCollections]);

  // Debounce free-text search so we're not firing a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchList = useCallback(
    (targetPage: number, append: boolean) => {
      setLoading(true);
      setError(null);
      const params: VocabularyListParams = { page: targetPage, pageSize: PAGE_SIZE, sort };
      if (search) params.search = search;
      if (collectionId) params.collectionId = collectionId;
      if (filter === "needs_review") params.needsReview = true;
      else if (filter === "known_before_app" || filter === "learned_through_app") params.known = filter;
      else if (filter !== "all") params.status = filter;

      api
        .listVocabulary(params)
        .then((res) => {
          setItems((prev) => (append ? [...prev, ...res.items] : res.items));
          setTotal(res.total);
          setPage(res.page);
        })
        .catch((e) => setError(e instanceof Error ? e.message : "Could not load your vocabulary."))
        .finally(() => setLoading(false));
    },
    [search, filter, sort, collectionId]
  );

  useEffect(() => {
    fetchList(1, false);
  }, [fetchList]);

  async function handleAddWord() {
    if (!newWord.trim() || adding) return;
    setAdding(true);
    setAddError(null);
    try {
      await api.addWord(newWord.trim());
      setNewWord("");
      setAddingWord(false);
      loadSummary();
      fetchList(1, false);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Could not add that word.");
    } finally {
      setAdding(false);
    }
  }

  const hasMore = items.length < total;
  const emptyBank = summary?.total === 0;

  return (
    <div className="space-y-5 pb-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">My Vocabulary</h1>
        <button className="btn-primary text-sm shrink-0" onClick={() => setAddingWord((v) => !v)}>
          + Add Word
        </button>
      </div>

      {addingWord && (
        <div className="card p-4 space-y-3">
          <label className="text-sm font-medium text-slate-700">Add a word to your vocabulary</label>
          <div className="flex gap-2">
            <input
              autoFocus
              value={newWord}
              onChange={(e) => setNewWord(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddWord()}
              placeholder="e.g. resilient"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-base"
            />
            <button className="btn-primary" disabled={adding} onClick={handleAddWord}>
              Add
            </button>
          </div>
          {addError && <p className="text-sm text-red-600">{addError}</p>}
        </div>
      )}

      {summary && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile label="Total words" value={summary.total} />
            <StatTile label="Learning" value={summary.learning} />
            <StatTile label="Needs Review" value={summary.needsReview} accent="text-red-600" />
            <StatTile label="Mastered" value={summary.mastered} accent="text-emerald-600" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Known before app" value={summary.knownBeforeApp} />
            <StatTile label="Learned through app" value={summary.learnedThroughApp} accent="text-brand-700" />
          </div>
        </div>
      )}

      <div className="space-y-3">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search your vocabulary..."
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-base"
        />

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
          {FILTERS.map((f) => (
            <button key={f.value} onClick={() => setFilter(f.value)} className={`chip ${filter === f.value ? "chip-active" : ""}`}>
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 flex-1">
            <button
              onClick={() => setCollectionId(null)}
              className={`chip ${collectionId === null ? "chip-active" : ""}`}
            >
              All collections
            </button>
            {collections.map((c) => (
              <button
                key={c.id}
                onClick={() => setCollectionId(c.id)}
                className={`chip ${collectionId === c.id ? "chip-active" : ""}`}
              >
                {c.name} ({c.wordCount})
              </button>
            ))}
          </div>
          <button className="btn-secondary text-sm shrink-0" onClick={() => setShowCollections(true)}>
            Manage
          </button>
        </div>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm bg-white w-full sm:w-auto"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              Sort: {s.label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && items.length === 0 && (
        <EmptyState
          title={filter === "needs_review" ? "No words need review" : emptyBank ? "Your vocabulary bank is empty" : "No words match these filters"}
          description={
            filter === "needs_review"
              ? "You've caught up! Come back when your next review is due."
              : emptyBank
                ? "Start an assessment or add your first word to begin."
                : "Try a different search or filter."
          }
        />
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <WordCard key={item.userVocabularyId} item={item} />
        ))}
      </div>

      {loading && <p className="text-center text-sm text-slate-400">Loading...</p>}

      {!loading && hasMore && (
        <button className="btn-secondary w-full" onClick={() => fetchList(page + 1, true)}>
          Load more
        </button>
      )}

      {showCollections && (
        <CollectionsManager collections={collections} onClose={() => setShowCollections(false)} onChanged={loadCollections} />
      )}
    </div>
  );
}
