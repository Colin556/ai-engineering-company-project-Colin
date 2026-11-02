import { login, updateSupplierRate } from "../lib/api";
import { expireSession } from "../lib/auth";
import { track } from "../lib/services/telemetry";

jest.mock("../lib/services/telemetry", () => ({ track: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  global.fetch = jest.fn();
});

test("failed login excludes credentials and uses the approved failure code", async () => {
  (fetch as jest.Mock).mockResolvedValue({ ok: false, status: 401, json: async () => ({ detail: "Invalid credentials" }) });
  await expect(login("private@example.test", "never-capture-this")).rejects.toThrow();
  expect(track).toHaveBeenCalledWith("auth_login_failed", { auth_method: "password", failure_code: "invalid_credentials", duration_ms: expect.any(Number) });
  expect(JSON.stringify((track as jest.Mock).mock.calls)).not.toContain("private@example.test");
  expect(JSON.stringify((track as jest.Mock).mock.calls)).not.toContain("never-capture-this");
});

test("network login failures use the registry's provider_unavailable category", async () => {
  (fetch as jest.Mock).mockRejectedValue(new TypeError("network"));
  await expect(login("private@example.test", "password")).rejects.toThrow();
  expect(track).toHaveBeenCalledWith("auth_login_failed", expect.objectContaining({ failure_code: "provider_unavailable" }));
});

test("expiry is captured once before clearing the authenticated token", () => {
  localStorage.setItem("brasaland_access_token", "token");
  expireSession("absolute");
  expireSession("absolute");
  expect(track).toHaveBeenCalledTimes(1);
  expect(track).toHaveBeenCalledWith("auth_session_expired", expect.objectContaining({ expiry_type: "absolute" }));
  expect(localStorage.getItem("brasaland_access_token")).toBeNull();
});

test("supplier changes include identifiers and field names only", async () => {
  (fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 2, name: "Private supplier display name", country: "CO" }) });
  await updateSupplierRate(2, 120);
  expect(track).toHaveBeenCalledWith("supplier_record_updated", { supplier_id: "2", country: "CO", changed_fields: ["rate"] });
});