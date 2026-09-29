import { clearToken, getToken, setToken } from "@/lib/auth";
import {
  AccountProfile,
  AccountProfileInput,
  MeResponse,
  RegisterInput,
  TokenResponse,
} from "@/lib/types";

const DEFAULT_AUTH_API_BASE_URL = "http://127.0.0.1:8000";

// Candidate records come from a third-party API; the session JWT is only ever sent to the Brasaland API.
const AUTH_API_BASE_URL = (
  process.env.NEXT_PUBLIC_AUTH_API_BASE_URL || DEFAULT_AUTH_API_BASE_URL
)
  .trim()
  .replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  const body = await response.json().catch(() => null);
  const detail = body?.detail;

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
    response.status,
  );
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${AUTH_API_BASE_URL}${path}`, { ...init, cache: "no-store" });
  } catch {
    throw new ApiError("Could not reach the server. Please try again.", 0);
  }
}

/** Calls a protected endpoint: attaches the bearer token and ends the session on 401. */
async function authJson<T>(path: string, init?: RequestInit): Promise<T> {
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
  return (await response.json()) as T;
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

  const token = (await response.json()) as TokenResponse;
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

export function updateMyProfile(input: AccountProfileInput): Promise<AccountProfile> {
  return authJson<AccountProfile>("/profiles/me", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
