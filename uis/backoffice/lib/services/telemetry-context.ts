export const TELEMETRY_SCHEMA_VERSION = 1;
let requestId: string | null = null;

export function withRequestId<Result>(id: string, action: () => Result): Result {
  const previous = requestId;
  requestId = id;
  try {
    return action();
  } finally {
    requestId = previous;
  }
}

export function currentRequestId(): string {
  return requestId ?? crypto.randomUUID();
}