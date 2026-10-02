import { clearToken, getToken, setToken } from "@/lib/auth";
import {
  IncidentAnalysisResult,
  Incident,
  IncidentInput,
  IncidentOptions,
  IncidentStatus,
  IncidentSummary,
  MeResponse,
  Profile,
  ProfileInput,
  RegisterInput,
  Supplier,
  SupplierCategory,
  SupplierCountry,
  SupplierInput,
  SupplierStatus,
  TokenResponse,
} from "@/lib/types";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";

function apiBaseUrl(): string {
  const envValue = process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL;
  return envValue.trim().replace(/\/$/, "");
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fieldErrors: Record<string, string> = {}
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  const body = await response.json().catch(() => null);
  const detail = body?.detail;

  if (response.status >= 500) {
    return new ApiError(
      "The service is temporarily unavailable. Please try again.",
      response.status
    );
  }

  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const field = typeof detail.field === "string" ? detail.field : undefined;
    const message =
      typeof detail.message === "string" ? detail.message : "Check your entries and try again.";
    return new ApiError(
      message,
      response.status,
      field ? { [field]: message } : {}
    );
  }

  if (Array.isArray(detail)) {
    const fieldErrors: Record<string, string> = {};
    for (const item of detail) {
      const field = item?.loc?.[0] === "body" ? item.loc[1] : undefined;
      if (typeof field === "string" && !fieldErrors[field]) {
        fieldErrors[field] = item.msg;
      }
    }
    const message = detail.map((item) => item.msg).join("; ");
    return new ApiError(message || "Invalid request.", response.status, fieldErrors);
  }

  return new ApiError(
    typeof detail === "string" ? detail : `Request failed (HTTP ${response.status}).`,
    response.status
  );
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${apiBaseUrl()}${path}`, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("Could not reach the server. Please try again.", 0);
  }
}

/** Calls a protected endpoint: attaches the bearer token and ends the session on 401. */
async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (typeof init?.body === "string") headers.set("Content-Type", "application/json");

  const response = await send(path, { ...init, headers });

  if (response.status === 401) {
    clearToken();
    window.location.replace("/login");
    throw new ApiError("Your session has expired. Please sign in again.", 401);
  }
  if (!response.ok) throw await toApiError(response);
  return response;
}

async function authJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authFetch(path, init);
  return response.json();
}

export async function login(email: string, password: string): Promise<void> {
  // OAuth2 password flow: form-encoded, with the email sent as `username`.
  const response = await send("/auth/login", {
    method: "POST",
    body: new URLSearchParams({ username: email, password }),
  });

  if (!response.ok) {
    if (response.status === 422) {
      throw new ApiError("Enter your email and password.", 422);
    }
    throw await toApiError(response);
  }

  const token: TokenResponse = await response.json();
  setToken(token.access_token);
}

export async function register(input: RegisterInput): Promise<void> {
  const response = await send("/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await toApiError(response);
    if (response.status === 409) error.fieldErrors.email = error.message;
    throw error;
  }

  await login(input.email, input.password);
}

export function getMe(): Promise<MeResponse> {
  return authJson<MeResponse>("/auth/me");
}

async function postPublicJson(path: string, body: unknown): Promise<void> {
  const response = await send(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await toApiError(response);
}

export function requestPasswordReset(email: string): Promise<void> {
  return postPublicJson("/auth/forgot-password", { email });
}

export function resetPassword(token: string, newPassword: string): Promise<void> {
  return postPublicJson("/auth/reset-password", {
    token,
    new_password: newPassword,
  });
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  await authFetch("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
}

export function updateMyProfile(input: ProfileInput): Promise<Profile> {
  return authJson<Profile>("/profiles/me", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function analyzeIncidentsFile(
  file: File
): Promise<IncidentAnalysisResult> {
  const formData = new FormData();
  formData.append("file", file);

  return authJson<IncidentAnalysisResult>("/api/incidents/analyze", {
    method: "POST",
    body: formData,
  });
}

export function getIncidentOptions(signal?: AbortSignal): Promise<IncidentOptions> {
  return authJson<IncidentOptions>("/api/incidents/options", { signal });
}

export function createIncident(input: IncidentInput): Promise<Incident> {
  return authJson<Incident>("/api/incidents", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listIncidents(
  filters: {
    status?: IncidentStatus;
    origin?: IncidentInput["origin"];
    branch?: string;
  },
  signal?: AbortSignal
): Promise<Incident[]> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, value);
  }
  const suffix = query.size ? `?${query}` : "";
  return authJson<Incident[]>(`/api/incidents${suffix}`, { signal });
}

export function getIncidentSummary(signal?: AbortSignal): Promise<IncidentSummary> {
  return authJson<IncidentSummary>("/api/incidents/summary", { signal });
}

export function updateIncidentStatus(
  id: number,
  status: IncidentStatus
): Promise<Incident> {
  return authJson<Incident>(`/api/incidents/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

// A plain <a href> cannot send the Authorization header, so download via fetch.
export async function downloadResultsCsv(): Promise<void> {
  const response = await authFetch("/api/incidents/results/export");
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = "results.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function listSuppliers(
  filters: { country?: SupplierCountry; category?: SupplierCategory },
  signal?: AbortSignal
): Promise<Supplier[]> {
  const query = new URLSearchParams();
  if (filters.country) query.set("country", filters.country);
  if (filters.category) query.set("category", filters.category);
  const suffix = query.size ? `?${query}` : "";
  return authJson<Supplier[]>(`/suppliers${suffix}`, { signal });
}

export function createSupplier(input: SupplierInput): Promise<Supplier> {
  return authJson<Supplier>("/suppliers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateSupplierRate(
  id: number,
  ratePerUnit: number
): Promise<Supplier> {
  return authJson<Supplier>(`/suppliers/${id}/rate`, {
    method: "PATCH",
    body: JSON.stringify({ rate_per_unit: ratePerUnit }),
  });
}

export function updateSupplierStatus(
  id: number,
  status: SupplierStatus
): Promise<Supplier> {
  return authJson<Supplier>(`/suppliers/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}
