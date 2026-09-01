const API_BASE = ""; // same-origin; Vite dev proxy forwards /api

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

export interface HealthResponse {
  ok: boolean;
  app: string;
  phase: number;
  aiProvider: string;
  aiConfigured: boolean;
}

export const api = {
  health: () => request<HealthResponse>("/api/health"),
};
