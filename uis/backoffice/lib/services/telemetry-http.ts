import { track } from "./telemetry";
import { captureFrontendError } from "./telemetry-browser";
import { withRequestId } from "./telemetry-context";

export async function measuredFetch(url: string, path: string, init?: RequestInit): Promise<Response> {
  if (typeof crypto.randomUUID !== "function") return fetch(url, init);
  const headers = new Headers(init?.headers);
  const id = headers.get("X-Request-ID") ?? crypto.randomUUID();
  headers.set("X-Request-ID", id);
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers });
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) {
      withRequestId(id, () => captureFrontendError("api_network_error"));
    }
    throw error;
  }
  const template = path.split("?")[0].replace(/\/\d+(?=\/|$)/g, "/{id}");
  const duration = response.headers?.get("Server-Timing")?.match(/(?:^|,)\s*app;dur=([0-9.]+)/)?.[1];
  if (duration) {
    const properties = { route_id: template, method: init?.method ?? "GET", status_code: response.status, duration_ms: Number(duration) };
    withRequestId(id, () => {
      if (!response.ok) track("api_request_failed", { ...properties, error_code: response.status === 401 ? "unauthorized" : response.status >= 500 ? "server_error" : "request_rejected", dependency: "api" });
      else if (Number(duration) >= 1000 || parseInt(id.slice(0, 8), 16) % 100 < 5) {
        track("api_request_completed", { ...properties, sample_rate: Number(duration) >= 1000 ? 1 : 0.05 });
      }
    });
  }
  return response;
}

export function captureDrafts(response: Response, drafts: unknown): void {
  if (!Array.isArray(drafts)) return;
  const id = response.headers?.get("X-Request-ID") ?? crypto.randomUUID();
  withRequestId(id, () => {
    for (const draft of drafts) {
      if (typeof draft?.event_type === "string" && draft?.properties && typeof draft.properties === "object") {
        track(draft.event_type, draft.properties);
      }
    }
  });
}