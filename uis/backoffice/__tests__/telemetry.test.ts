import { webcrypto } from "node:crypto";

describe("telemetry queue", () => {
  let track: typeof import("../lib/services/telemetry").track;
  let sendBeacon: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
    Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
    process.env.NEXT_PUBLIC_TELEMETRY_ENDPOINT = "http://localhost:8000/telemetry/events";
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    sendBeacon = jest.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "sendBeacon", { value: sendBeacon, configurable: true });
    track = require("../lib/services/telemetry").track;
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  const record = () => track("auth_login_failed", { auth_method: "password", failure_code: "invalid_credentials" });
  const sent = () => JSON.parse((fetch as jest.Mock).mock.calls[0][1].body).events;

  test("queues until ten seconds, with occurrence metadata", async () => {
    record();
    expect(fetch).not.toHaveBeenCalled();
    const captured = new Date().toISOString();
    await jest.advanceTimersByTimeAsync(10_000);
    expect(sent()[0]).toMatchObject({ timestamp: captured, sessionId: null, userId: null, schemaVersion: 1 });
    expect(sent()[0].eventId).toMatch(/^[a-f0-9-]{36}$/);
  });

  test("flushes twenty events in one request", async () => {
    for (let index = 0; index < 20; index++) record();
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sent()).toHaveLength(20);
  });

  test("rejects unknown types and unapproved properties", async () => {
    track("click", {});
    track("auth_login_failed", { auth_method: "password", failure_code: "invalid_credentials", email: "private" });
    await jest.advanceTimersByTimeAsync(10_000);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("retries three times with stable IDs then discards", async () => {
    (fetch as jest.Mock).mockRejectedValue(new Error("offline"));
    record();
    await jest.advanceTimersByTimeAsync(17_000);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(new Set((fetch as jest.Mock).mock.calls.map((call) => call[1].body)).size).toBe(1);
    await jest.advanceTimersByTimeAsync(20_000);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  test("hidden tabs use beacon without removing rejected sends", async () => {
    record();
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    sendBeacon.mockReturnValueOnce(false);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(sendBeacon).toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(10_000);
    expect(sent()).toHaveLength(1);
  });

  test("uses only the HMAC claim and rotates sessions on login", async () => {
    const token = (issued: number) => `header.${btoa(JSON.stringify({ sub: "raw-user-id", telemetry_user_id: "a".repeat(64), iat: issued }))}.signature`;
    localStorage.setItem("brasaland_access_token", token(1));
    track("auth_login_succeeded", { auth_method: "password", duration_ms: 5 });
    localStorage.setItem("brasaland_access_token", token(2));
    track("auth_login_succeeded", { auth_method: "password", duration_ms: 5 });
    await jest.advanceTimersByTimeAsync(10_000);
    expect(sent()[0].userId).toBe("a".repeat(64));
    expect(sent()[0].sessionId).not.toBe(sent()[1].sessionId);
    expect(JSON.stringify(sent())).not.toContain("raw-user-id");
  });
});