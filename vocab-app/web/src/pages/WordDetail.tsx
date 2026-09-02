import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type WordDetail as WordDetailType, type CollectionSummary } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const isoLike = iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`;
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export function WordDetail() {
  const { userVocabularyId } = useParams<{ userVocabularyId: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<WordDetailType | null>(null);
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!userVocabularyId) return;
    api
      .getWordDetail(userVocabularyId)
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load this word."));
    api.listCollections().then(setCollections).catch(() => {});
  }, [userVocabularyId]);

  useEffect(() => {
    load();
  }, [load]);

  function notify(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(null), 2000);
  }

  async function handleDontKnow() {
    if (!detail || busy) return;
    setBusy(true);
    try {
      await api.markDontKnow(detail.wordId);
      load();
      notify("Marked as not known");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyWord() {
    if (!detail) return;
    await navigator.clipboard.writeText(detail.word);
    notify("Word copied");
  }

  async function handleCopyDetails() {
    if (!detail) return;
    const primary = detail.senses[0];
    const lines = [detail.word];
    if (primary) {
      lines.push(primary.partOfSpeech, primary.definition);
      if (primary.exampleSentence) lines.push(primary.exampleSentence);
    } else {
      lines.push("Definition not yet available.");
    }
    await navigator.clipboard.writeText(lines.join("\n"));
    notify("Details copied");
  }

  async function toggleCollection(collectionId: string, inCollection: boolean) {
    if (!detail || busy) return;
    setBusy(true);
    try {
      if (inCollection) await api.removeWordFromCollection(collectionId, detail.userVocabularyId);
      else await api.addWordToCollection(collectionId, detail.userVocabularyId);
      load();
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!detail) return <p className="text-sm text-slate-500">Loading...</p>;

  const memberCollectionIds = new Set(detail.collections.map((c) => c.id));

  return (
    <div className="max-w-xl mx-auto space-y-5 pb-8">
      <button className="text-sm text-slate-500" onClick={() => navigate(-1)}>
        &larr; Back
      </button>

      <div className="card p-6 space-y-4">
        <div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-3xl font-bold text-slate-900">{detail.word}</h1>
            {detail.senses[0]?.phonetic && <span className="text-slate-400">{detail.senses[0].phonetic}</span>}
          </div>
          {detail.senses[0]?.pronunciation && <p className="text-sm text-slate-400">{detail.senses[0].pronunciation}</p>}
        </div>

        <div className="flex items-center justify-between">
          <StatusBadge status={detail.status} needsReview={detail.needsReview} />
          <div className="text-right">
            <p className="text-xs text-slate-500">Mastery</p>
            <p className="text-xl font-bold text-slate-900">{detail.masteryScore}%</p>
          </div>
        </div>

        {detail.knownBeforeApp && (
          <p className="text-sm rounded-lg bg-slate-50 px-3 py-2 text-slate-600">
            Known before using this app - not counted as a word learned through the app.
          </p>
        )}

        {detail.senses.length === 0 ? (
          <p className="text-sm text-slate-500 italic">Definition not yet available for this word.</p>
        ) : (
          <div className="space-y-4">
            {detail.senses.map((sense, i) => (
              <div key={i} className="space-y-1">
                {detail.senses.length > 1 && <p className="text-xs font-semibold text-slate-400">Meaning {i + 1}</p>}
                <p className="text-xs uppercase tracking-wide text-slate-400">{sense.partOfSpeech}</p>
                <p className="text-slate-800">{sense.definition}</p>
                {sense.exampleSentence && <p className="text-sm text-slate-500 italic">"{sense.exampleSentence}"</p>}
              </div>
            ))}
          </div>
        )}

        {(detail.synonyms.length > 0 || detail.antonyms.length > 0 || detail.related.length > 0) && (
          <div className="space-y-2 pt-3 border-t border-slate-100">
            {detail.synonyms.length > 0 && (
              <p className="text-sm">
                <span className="text-slate-400">Synonyms: </span>
                {detail.synonyms.join(", ")}
              </p>
            )}
            {detail.antonyms.length > 0 && (
              <p className="text-sm">
                <span className="text-slate-400">Antonyms: </span>
                {detail.antonyms.join(", ")}
              </p>
            )}
            {detail.related.length > 0 && (
              <p className="text-sm">
                <span className="text-slate-400">Related: </span>
                {detail.related.join(", ")}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="card p-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-slate-400">First encountered</p>
          <p className="font-medium text-slate-900">{formatDate(detail.firstEncounteredAt)}</p>
        </div>
        <div>
          <p className="text-slate-400">Next review</p>
          <p className="font-medium text-slate-900">{formatDate(detail.nextReviewAt)}</p>
        </div>
        <div>
          <p className="text-slate-400">Reviews</p>
          <p className="font-medium text-slate-900">{detail.reviewCount}</p>
        </div>
        <div>
          <p className="text-slate-400">Correct / Incorrect</p>
          <p className="font-medium text-slate-900">
            {detail.correctCount} / {detail.incorrectCount}
          </p>
        </div>
      </div>

      <div className="card p-5 space-y-3">
        <h2 className="text-sm font-medium text-slate-700">Collections</h2>
        {collections.length === 0 ? (
          <p className="text-sm text-slate-500">You don't have any collections yet.</p>
        ) : (
          <div className="space-y-2">
            {collections.map((c) => {
              const inCollection = memberCollectionIds.has(c.id);
              return (
                <label key={c.id} className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={inCollection}
                    disabled={busy}
                    onChange={() => toggleCollection(c.id, inCollection)}
                    className="h-5 w-5 rounded border-slate-300 text-brand-600"
                  />
                  {c.name}
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button className="btn-secondary" disabled={busy} onClick={handleDontKnow}>
          I don't know this
        </button>
        <button className="btn-secondary" onClick={handleCopyWord}>
          Copy word
        </button>
        <button className="btn-secondary col-span-2" onClick={handleCopyDetails}>
          Copy details
        </button>
      </div>

      {notice && <p className="text-center text-sm text-emerald-700">{notice}</p>}
    </div>
  );
}
