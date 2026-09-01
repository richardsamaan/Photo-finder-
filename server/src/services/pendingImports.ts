import fs from "node:fs";
import path from "node:path";
import { env } from "../env.js";
import { newId } from "../lib/ids.js";
import type { ParsedSheet } from "./fileParser.js";

const dir = path.join(env.STORAGE_DIR, "uploads");
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

export interface PendingImport {
  token: string;
  originalName: string;
  headers: string[];
  rows: Record<string, string>[];
  createdAt: string;
}

function fileFor(token: string): string {
  const safe = token.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(dir, `${safe}.json`);
}

export function savePendingImport(originalName: string, sheet: ParsedSheet): PendingImport {
  const token = newId("import");
  const pending: PendingImport = {
    token,
    originalName,
    headers: sheet.headers,
    rows: sheet.rows,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(fileFor(token), JSON.stringify(pending));
  return pending;
}

export function readPendingImport(token: string): PendingImport | null {
  const file = fileFor(token);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

export function deletePendingImport(token: string) {
  const file = fileFor(token);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
