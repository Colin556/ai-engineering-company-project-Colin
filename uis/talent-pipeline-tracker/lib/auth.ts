const TOKEN_KEY = "brasaland_access_token";
// The native "storage" event only fires in other tabs, so same-tab changes use this one.
const TOKEN_CHANGE_EVENT = "brasaland-token-change";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.dispatchEvent(new Event(TOKEN_CHANGE_EVENT));
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event(TOKEN_CHANGE_EVENT));
}

export function subscribeToToken(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(TOKEN_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(TOKEN_CHANGE_EVENT, onChange);
  };
}

/** Client-side sanity check only; the API remains the authority on validity. */
export function isTokenUsable(token: string | null): token is string {
  if (!token) return false;
  try {
    const payload = token.split(".")[1];
    const claims = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    );
    return typeof claims.exp === "number" && claims.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function logout(): void {
  clearToken();
  window.location.replace("/login");
}
