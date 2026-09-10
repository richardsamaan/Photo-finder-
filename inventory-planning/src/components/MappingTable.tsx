import type { ColumnMapping, FieldSpec } from "../types";

interface Props {
  fields: FieldSpec[];
  headers: string[];
  mapping: ColumnMapping;
  onChange: (key: string, header: string | null) => void;
}

export function MappingTable({ fields, headers, mapping, onChange }: Props) {
  return (
    <div>
      {fields.map((field) => (
        <div className="field-row" key={field.key}>
          <label>
            {field.label}
            {field.required && <span className="required">*</span>}
          </label>
          <select
            value={mapping[field.key] ?? ""}
            onChange={(e) => onChange(field.key, e.target.value === "" ? null : e.target.value)}
          >
            <option value="">— not mapped —</option>
            {headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

export function unmappedRequired(fields: FieldSpec[], mapping: ColumnMapping): string[] {
  return fields.filter((f) => f.required && !mapping[f.key]).map((f) => f.label);
}
