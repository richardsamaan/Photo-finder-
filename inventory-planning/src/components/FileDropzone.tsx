import { useRef, useState } from "react";

interface Props {
  label: string;
  hint?: string;
  required?: boolean;
  fileName: string | null;
  onFile: (file: File) => void;
  onClear?: () => void;
}

export function FileDropzone({ label, hint, required, fileName, onFile, onClear }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <h4>
        {label}
        {required && <span style={{ color: "var(--red)" }}> *</span>}
      </h4>
      {hint && <p className="muted">{hint}</p>}
      <div
        className={`dropzone ${dragging ? "dragging" : ""} ${fileName ? "filled" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
      >
        {fileName ? (
          <div>
            <strong>{fileName}</strong>
            <div style={{ marginTop: 6 }}>
              <button
                type="button"
                className="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onClear?.();
                  if (inputRef.current) inputRef.current.value = "";
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <span className="muted">Drag & drop a file here, or click to browse (.xlsx, .xls, .csv)</span>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
      </div>
    </div>
  );
}
