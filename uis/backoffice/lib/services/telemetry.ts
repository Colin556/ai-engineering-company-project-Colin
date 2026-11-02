import Ajv from "ajv";
import registry from "../../../../docs/event-schemas.json";
import { currentRequestId, TELEMETRY_SCHEMA_VERSION } from "./telemetry-context";

type TelemetryEvent = {
  eventId: string;
  timestamp: string;
  sessionId: string | null;
  userId: string | null;
  event_type: string;
  schemaVersion: number;
  requestId: string;
  properties: Record<string, unknown>;
};

const validate = new Ajv().compile(registry);
const endpoint = process.env.NEXT_PUBLIC_TELEMETRY_ENDPOINT;
const SESSION_KEY = "brasaland_telemetry_session";
const MAX_QUEUE = 1000;
const BATCH_SIZE = 20;
let queue: TelemetryEvent[] = [];
let sending = false;
let initialized = false;
let activeBatch: TelemetryEvent[] | null = null;
const views = new Map<string, number>();
const validations = new Map<string, number>();

function identity(): { sessionId: string | null; userId: string | null } {
  const anonymous = { sessionId: null, userId: null };
  try {
    const token = localStorage.getItem("brasaland_access_token");
    if (!token) {
      sessionStorage.removeItem(SESSION_KEY);
      return anonymous;
    }
    const claims = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    const userId = claims.telemetry_user_id;
    if (typeof userId !== "string" || !/^[a-f0-9]{64}$/.test(userId)) return anonymous;
    const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    const issued = claims.jti ?? claims.iat;
    const session = stored?.tokenIssuedAt === issued && stored?.userId === userId
      ? stored
      : { sessionId: crypto.randomUUID(), userId, tokenIssuedAt: issued, startedAt: Date.now() };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return { sessionId: session.sessionId, userId };
  } catch {
    return anonymous;
  }
}

function payload(events: TelemetryEvent[]): string {
  return JSON.stringify({ events });
}

function beaconFlush(): void {
  if (!endpoint || !navigator.sendBeacon) return;
  const pending = [...(activeBatch ?? []), ...queue];
  const acknowledged = new Set<string>();
  while (pending.length) {
    const chunk: TelemetryEvent[] = [];
    while (pending.length && chunk.length < BATCH_SIZE) {
      const next = pending[0];
      if (new Blob([payload([...chunk, next])]).size > 48_000) break;
      chunk.push(pending.shift()!);
    }
    if (!chunk.length || !navigator.sendBeacon(endpoint, new Blob([payload(chunk)], { type: "text/plain;charset=UTF-8" }))) break;
    const delivered = new Set(chunk.map((event) => event.eventId));
    for (const id of delivered) acknowledged.add(id);
    queue = queue.filter((event) => !delivered.has(event.eventId));
    if (activeBatch && activeBatch.every((event) => acknowledged.has(event.eventId))) activeBatch = null;
  }
}

async function flush(): Promise<void> {
  if (!endpoint || sending || !queue.length) return;
  sending = true;
  const batch = queue.splice(0, BATCH_SIZE);
  activeBatch = batch;
  try {
    for (let attempt = 0; attempt <= 3 && activeBatch === batch; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(endpoint, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: payload(batch), signal: controller.signal, credentials: "omit",
        });
        if (response.ok) break;
        if (response.status >= 400 && response.status < 500 && response.status !== 429) break;
      } catch {
      } finally {
        clearTimeout(timeout);
      }
      if (attempt < 3 && activeBatch === batch) {
        await new Promise<void>((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      }
    }
  } finally {
    if (activeBatch === batch) activeBatch = null;
    sending = false;
    if (queue.length >= BATCH_SIZE) void flush();
  }
}

function initialize(): void {
  if (initialized) return;
  initialized = true;
  setInterval(() => { void flush(); }, 10_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") beaconFlush();
  });
  window.addEventListener("pagehide", beaconFlush);
  window.addEventListener("brasaland-token-change", () => { identity(); });
}

export function track(eventType: string, properties: Record<string, unknown>): void {
  if (typeof window === "undefined" || !endpoint) return;
  try {
    initialize();
    const actor = eventType === "auth_login_failed" ? { sessionId: null, userId: null } : identity();
    const event: TelemetryEvent = {
      eventId: crypto.randomUUID(), timestamp: new Date().toISOString(),
      ...actor, event_type: eventType, schemaVersion: TELEMETRY_SCHEMA_VERSION,
      requestId: currentRequestId(), properties: JSON.parse(JSON.stringify(properties)),
    };
    if (!validate(event) || new Blob([payload([event])]).size > 48_000) return;
    const now = Date.now();
    const key = `${actor.sessionId}:${JSON.stringify(properties)}`;
    const dedup = eventType === "navigation_section_viewed" ? views
      : eventType === "inventory_validation_failed" ? validations : null;
    const windowMs = eventType === "navigation_section_viewed" ? 30_000 : 300_000;
    if (dedup) {
      if (now - (dedup.get(key) ?? -Infinity) < windowMs) return;
      if (dedup.size >= MAX_QUEUE) dedup.clear();
      dedup.set(key, now);
    }
    if (queue.length >= MAX_QUEUE) queue.shift();
    queue.push(event);
    if (queue.length >= BATCH_SIZE) void flush();
  } catch {
  }
}