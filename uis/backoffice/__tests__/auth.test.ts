import { getToken, isTokenUsable } from "../lib/auth";

function makeToken(exp: number): string {
  const payload = btoa(JSON.stringify({ exp }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${payload}.signature`;
}

describe("getToken", () => {
  beforeEach(() => localStorage.clear());

  it("returns the stored access token", () => {
    localStorage.setItem("brasaland_access_token", "stored-token");

    expect(getToken()).toBe("stored-token");
  });

  it("returns null when no token is stored", () => {
    expect(getToken()).toBeNull();
  });
});

describe("isTokenUsable", () => {
  it("accepts an unexpired token with an expiry claim", () => {
    expect(isTokenUsable(makeToken(Math.floor(Date.now() / 1000) + 60))).toBe(true);
  });

  it.each(["not-a-token", "header.e30.signature", makeToken(1)])(
    "rejects an invalid or expired token (%s)",
    (token) => {
      expect(isTokenUsable(token)).toBe(false);
    }
  );
});