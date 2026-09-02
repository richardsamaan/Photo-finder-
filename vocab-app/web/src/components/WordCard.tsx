import { Link } from "react-router-dom";
import { StatusBadge } from "./StatusBadge";
import type { VocabularyListItem } from "../api/client";

export function WordCard({ item }: { item: VocabularyListItem }) {
  return (
    <Link to={`/vocabulary/${item.userVocabularyId}`} className="card block p-4 hover:border-brand-300 transition">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-slate-900">{item.word}</h3>
            {item.phonetic && <span className="text-xs text-slate-400">{item.phonetic}</span>}
          </div>
          {item.partOfSpeech && <p className="text-xs text-slate-400 italic">{item.partOfSpeech}</p>}
          <p className="text-sm text-slate-600 mt-1 line-clamp-2">{item.definition ?? "Definition not yet available."}</p>
          {item.knownBeforeApp && <p className="text-xs text-slate-400 mt-1">Known before using this app</p>}
        </div>
        <div className="shrink-0 space-y-1">
          <StatusBadge status={item.status} needsReview={item.needsReview} />
          <p className="text-xs text-slate-400 text-right">{item.masteryScore}% mastery</p>
        </div>
      </div>
    </Link>
  );
}
