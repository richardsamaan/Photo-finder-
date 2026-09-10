import { useAppStore, type WizardStep } from "./state/appStore";
import { UploadStep } from "./components/UploadStep";
import { MappingStep } from "./components/MappingStep";
import { CategoriesStep } from "./components/CategoriesStep";
import { ReportsStep } from "./components/ReportsStep";

const STEPS: { id: WizardStep; label: string }[] = [
  { id: "upload", label: "1. Upload files" },
  { id: "mapping", label: "2. Column mapping" },
  { id: "categories", label: "3. Category resolution" },
  { id: "reports", label: "4. Reports" },
];

export default function App() {
  const step = useAppStore((s) => s.step);
  const setStep = useAppStore((s) => s.setStep);
  const inv01File = useAppStore((s) => s.inv01File);
  const sa79File = useAppStore((s) => s.sa79File);
  const orderFile = useAppStore((s) => s.orderFile);
  const colourKeyFile = useAppStore((s) => s.colourKeyFile);
  const inv01Rows = useAppStore((s) => s.inv01Rows);

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  function canJumpTo(target: WizardStep): boolean {
    const targetIndex = STEPS.findIndex((s) => s.id === target);
    if (targetIndex <= stepIndex) return true;
    if (target === "mapping") return !!inv01File && !!sa79File && !!orderFile && !!colourKeyFile;
    if (target === "categories") return inv01Rows.length > 0;
    if (target === "reports") return false; // gated by CategoriesStep's own validation
    return false;
  }

  return (
    <div>
      <header className="app-header">
        <h1>Inventory Planning</h1>
        <span className="phase-tag">Phase 1 — client-side only, nothing is saved</span>
      </header>

      <div className="stepper">
        {STEPS.map((s, i) => (
          <div
            key={s.id}
            className={`step ${s.id === step ? "active" : i < stepIndex ? "done" : ""}`}
            style={{ cursor: canJumpTo(s.id) ? "pointer" : "default" }}
            onClick={() => canJumpTo(s.id) && setStep(s.id)}
          >
            {s.label}
          </div>
        ))}
      </div>

      {step === "upload" && <UploadStep />}
      {step === "mapping" && inv01File && sa79File && orderFile && colourKeyFile && <MappingStep />}
      {step === "categories" && <CategoriesStep />}
      {step === "reports" && <ReportsStep />}
    </div>
  );
}
