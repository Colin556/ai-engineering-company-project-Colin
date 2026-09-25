import { IncidentAnalysisResult } from "@/lib/types";

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
