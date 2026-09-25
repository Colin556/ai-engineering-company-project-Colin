import {
  IncidentAnalysisResult,
  Supplier,
  SupplierCategory,
  SupplierCountry,
  SupplierInput,
  SupplierStatus,
} from "@/lib/types";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";

function apiBaseUrl(): string {
  const envValue = process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL;
  return envValue.trim().replace(/\/$/, "");
}

export async function analyzeIncidentsFile(
  file: File
): Promise<IncidentAnalysisResult> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${apiBaseUrl()}/api/incidents/analyze`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail || `Analysis failed (HTTP ${response.status}).`);
  }

  return response.json();
}

export function exportResultsUrl(): string {
  return `${apiBaseUrl()}/api/incidents/results/export`;
}

async function supplierRequest<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: init?.body
      ? { "Content-Type": "application/json", ...init.headers }
      : init?.headers,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail;
    const message = Array.isArray(detail)
      ? detail.map((item) => item.msg).join("; ")
      : detail;
    throw new Error(message || `Request failed (HTTP ${response.status}).`);
  }

  return response.json();
}

export function listSuppliers(
  filters: { country?: SupplierCountry; category?: SupplierCategory },
  signal?: AbortSignal
): Promise<Supplier[]> {
  const query = new URLSearchParams();
  if (filters.country) query.set("country", filters.country);
  if (filters.category) query.set("category", filters.category);
  const suffix = query.size ? `?${query}` : "";
  return supplierRequest<Supplier[]>(`/suppliers${suffix}`, { signal });
}

export function createSupplier(input: SupplierInput): Promise<Supplier> {
  return supplierRequest<Supplier>("/suppliers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateSupplierRate(
  id: number,
  ratePerUnit: number
): Promise<Supplier> {
  return supplierRequest<Supplier>(`/suppliers/${id}/rate`, {
    method: "PATCH",
    body: JSON.stringify({ rate_per_unit: ratePerUnit }),
  });
}

export function updateSupplierStatus(
  id: number,
  status: SupplierStatus
): Promise<Supplier> {
  return supplierRequest<Supplier>(`/suppliers/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}
