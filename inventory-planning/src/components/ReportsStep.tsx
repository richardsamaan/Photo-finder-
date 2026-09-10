import { useState } from "react";
import { useAppStore } from "../state/appStore";
import { FORECAST_METHODS, viewScopes } from "../types";
import { CategoryStudyReport } from "./reports/CategoryStudyReport";
import { RiskFlaggingReport } from "./reports/RiskFlaggingReport";
import { SizeColourReport } from "./reports/SizeColourReport";
import { ProfitabilityReport } from "./reports/ProfitabilityReport";

type Tab = "study" | "risk" | "sizeColour" | "profitability";

const TABS: { id: Tab; label: string }[] = [
  { id: "study", label: "Category Study" },
  { id: "risk", label: "Risk Flagging" },
  { id: "sizeColour", label: "Size/Colour Suggestion %" },
  { id: "profitability", label: "Profitability" },
];

export function ReportsStep() {
  const store = useAppStore();
  const [tab, setTab] = useState<Tab>("study");

  return (
    <div>
      <div className="panel">
        <h2>Reports</h2>
        <div className="grid-2">
          <div>
            <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>View</label>
            <div className="pill-row">
              {viewScopes().map((s) => (
                <button key={s.id} className={`pill ${store.scope === s.id ? "active" : ""}`} onClick={() => store.setScope(s.id)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>
              Forecast method (used by Category Study &amp; Risk Flagging)
            </label>
            <div className="pill-row">
              {FORECAST_METHODS.map((m) => (
                <button
                  key={m.id}
                  className={`pill ${store.forecastMethod === m.id ? "active" : ""}`}
                  onClick={() => store.setForecastMethod(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <dl className="methods-explainer">
          {FORECAST_METHODS.map((m) => (
            <div key={m.id}>
              <dt>{m.label}</dt>
              <dd>{m.explanation}</dd>
            </div>
          ))}
        </dl>
        <button className="secondary" onClick={() => store.setStep("categories")}>
          ← Back to category resolution
        </button>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <div key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </div>
        ))}
      </div>

      {tab === "study" && <CategoryStudyReport />}
      {tab === "risk" && <RiskFlaggingReport />}
      {tab === "sizeColour" && <SizeColourReport />}
      {tab === "profitability" && <ProfitabilityReport />}
    </div>
  );
}
