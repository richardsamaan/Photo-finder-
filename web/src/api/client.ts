const API_BASE = ""; // same-origin; Vite dev proxy forwards /api and /storage

export class ApiError extends Error {
  constructor(message: string, public status: number, public blocked = false) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: init?.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...init?.headers },
  });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status, Boolean(data?.blocked));
  }
  return data as T;
}

export const api = {
  health: () => request<{ ok: boolean; searchProvider: string; searchConfigured: boolean }>("/api/health"),

  uploadImport: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<ImportUploadResponse>("/api/import/upload", { method: "POST", body: fd });
  },
  previewImportMapping: (token: string, mapping: ColumnMappingInput) =>
    request<ImportPreviewResponse>(`/api/import/${token}/preview`, {
      method: "POST",
      body: JSON.stringify(mapping),
    }),
  confirmImport: (token: string, mapping: ColumnMappingInput) =>
    request<ImportConfirmResponse>(`/api/import/${token}/confirm`, {
      method: "POST",
      body: JSON.stringify(mapping),
    }),
  cancelImport: (token: string) => request<{ ok: boolean }>(`/api/import/${token}/cancel`, { method: "POST" }),

  listJobs: () => request<{ jobs: Job[] }>("/api/jobs"),
  getJob: (jobId: string) => request<JobDetailResponse>(`/api/jobs/${jobId}`),
  listProducts: (jobId: string, statuses?: string[]) =>
    request<{ products: Product[] }>(
      `/api/jobs/${jobId}/products${statuses?.length ? `?status=${statuses.join(",")}` : ""}`
    ),
  startJob: (jobId: string, productIds?: string[]) =>
    request<{ ok: boolean }>(`/api/jobs/${jobId}/start`, {
      method: "POST",
      body: JSON.stringify({ productIds }),
    }),
  retryFailed: (jobId: string) => request<{ ok: boolean }>(`/api/jobs/${jobId}/retry-failed`, { method: "POST" }),
  pauseJob: (jobId: string) => request<{ ok: boolean }>(`/api/jobs/${jobId}/pause`, { method: "POST" }),
  resumeJob: (jobId: string) => request<{ ok: boolean }>(`/api/jobs/${jobId}/resume`, { method: "POST" }),
  cancelJob: (jobId: string) => request<{ ok: boolean }>(`/api/jobs/${jobId}/cancel`, { method: "POST" }),

  getProduct: (productId: string) =>
    request<{ product: Product; candidates: Candidate[]; images: ProductImage[] }>(`/api/products/${productId}`),
  searchAgain: (productId: string) =>
    request<{ product: Product; candidates: Candidate[] }>(`/api/products/${productId}/search-again`, {
      method: "POST",
    }),
  selectCandidate: (productId: string, candidateId: string) =>
    request<{ product: Product }>(`/api/products/${productId}/select-candidate`, {
      method: "POST",
      body: JSON.stringify({ candidateId }),
    }),
  approveProduct: (productId: string) =>
    request<{ product: Product }>(`/api/products/${productId}/approve`, { method: "POST" }),
  rejectProduct: (productId: string) =>
    request<{ product: Product }>(`/api/products/${productId}/reject`, { method: "POST" }),
  uploadProductImage: (productId: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<{ product: Product }>(`/api/products/${productId}/upload-image`, {
      method: "POST",
      body: fd,
    });
  },

  generatePdfs: (jobId: string) =>
    request<{ ok: boolean; categories: string[]; masterPdf: string }>(`/api/export/${jobId}/generate-pdfs`, {
      method: "POST",
    }),
  generateZip: (jobId: string) => request<{ ok: boolean }>(`/api/export/${jobId}/generate-zip`, { method: "POST" }),

  cacheEntries: () => request<{ entries: CacheEntry[]; total: number }>("/api/cache"),
  clearCache: () => request<{ ok: boolean }>("/api/cache", { method: "DELETE" }),
};

// --- Types shared with the backend shape ---

export interface ColumnMappingInput {
  styleCode: string;
  colour: string;
  category: string;
}

export interface ImportUploadResponse {
  token: string;
  filename: string;
  headers: string[];
  totalRows: number;
  mapping: ColumnMappingInput & { confident: boolean };
  preview: { styleCode: string; colour: string; category: string }[];
  detectedCategories: string[];
}

export interface ImportPreviewResponse {
  preview: { styleCode: string; colour: string; category: string }[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  totalCategories: number;
  categories: string[];
}

export interface ImportConfirmResponse {
  jobId: string;
  totalProducts: number;
  totalCategories: number;
  categories: string[];
}

export interface Job {
  id: string;
  filename: string;
  status: string;
  columnMapping: string | null;
  totalProducts: number;
  processedProducts: number;
  concurrency: number;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  totalProducts: number;
  imagesFound: number;
  highConfidence: number;
  mediumConfidence: number;
  needsReview: number;
  notFound: number;
  approved: number;
  rejected: number;
  failed: number;
  pending: number;
}

export interface JobDetailResponse {
  job: Job;
  categories: string[];
  stats: DashboardStats;
  runnerState: string;
  searchConfigured: boolean;
  activeProvider: string;
}

export interface Product {
  id: string;
  jobId: string;
  rowNumber: number;
  styleCode: string;
  colour: string;
  category: string;
  status: string;
  confidence: number;
  imageUrl: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
  localImagePath: string | null;
  filename: string | null;
  verificationNotes: string | null;
  errorMessage: string | null;
  attempts: number;
  manuallyUploaded: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Candidate {
  id: string;
  productId: string;
  provider: string;
  query: string;
  url: string;
  title: string | null;
  snippet: string | null;
  domain: string;
  imageUrl: string | null;
  styleCodeMatch: boolean;
  colourMatch: boolean;
  categoryMatch: boolean;
  sourceTier: string;
  confidence: number;
  evidence: string | null;
  chosen: boolean;
  createdAt: string;
}

export interface ProductImage {
  id: string;
  productId: string;
  sourceUrl: string;
  localPath: string | null;
  width: number | null;
  height: number | null;
  verified: boolean;
  chosen: boolean;
  uploadedManually: boolean;
  createdAt: string;
}

export interface CacheEntry {
  id: string;
  cacheKey: string;
  styleCode: string;
  colour: string;
  status: string;
  confidence: number;
  imageUrl: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
  updatedAt: string;
}
