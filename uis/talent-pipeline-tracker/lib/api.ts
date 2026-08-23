import {
  CandidateCreatePayload,
  CandidateListResponse,
  CandidateNotesResponse,
  CandidatePatchPayload,
  CandidateQuery,
  CandidateRecord,
} from "@/lib/types";
import { DEFAULT_API_BASE_URL } from "@/lib/constants";

function normalizeApiBaseUrl(): string {
  const envValue =
    process.env.NEXT_PUBLIC_TALENT_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    DEFAULT_API_BASE_URL;

  const trimmed = envValue.trim();

  if (trimmed.endsWith("/docs")) {
    return trimmed.slice(0, -5);
  }

  return trimmed.replace(/\/$/, "");
}

const API_BASE_URL = normalizeApiBaseUrl();

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let details = "";
    try {
      const errorBody = await response.json();
      details = JSON.stringify(errorBody);
    } catch {
      details = response.statusText;
    }
    throw new Error(`API error ${response.status}: ${details}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function listCandidates(query: CandidateQuery): Promise<CandidateListResponse> {
  const params = new URLSearchParams();

  if (query.status) params.set("status", query.status);
  if (query.stage) params.set("stage", query.stage);
  if (query.search) params.set("search", query.search);
  params.set("page", String(query.page || 1));
  params.set("limit", String(query.limit || 20));

  return apiFetch<CandidateListResponse>(`/records?${params.toString()}`);
}

export function getCandidate(id: string): Promise<CandidateRecord> {
  return apiFetch<CandidateRecord>(`/records/${id}`);
}

export function createCandidate(payload: CandidateCreatePayload): Promise<CandidateRecord> {
  return apiFetch<CandidateRecord>("/records", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function replaceCandidate(
  id: string,
  payload: CandidateCreatePayload,
): Promise<CandidateRecord> {
  return apiFetch<CandidateRecord>(`/records/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function patchCandidate(
  id: string,
  payload: CandidatePatchPayload,
): Promise<CandidateRecord> {
  return apiFetch<CandidateRecord>(`/records/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function getCandidateNotes(id: string): Promise<CandidateNotesResponse> {
  return apiFetch<CandidateNotesResponse>(`/records/${id}/notes`);
}

export function addCandidateNote(id: string, content: string) {
  return apiFetch<{ id: string; record_id: string; content: string; created_at: string }>(
    `/records/${id}/notes`,
    {
      method: "POST",
      body: JSON.stringify({ content }),
    },
  );
}

export function deleteCandidateNote(id: string, noteId: string) {
  return apiFetch<void>(`/records/${id}/notes/${noteId}`, {
    method: "DELETE",
  });
}

export function deleteCandidate(id: string) {
  return apiFetch<void>(`/records/${id}`, {
    method: "DELETE",
  });
}
