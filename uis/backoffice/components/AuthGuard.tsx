"use client";

import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useSyncExternalStore } from "react";
import { expireSession, getToken, isTokenUsable, subscribeToToken } from "@/lib/auth";

// `undefined` = not yet read (server render / hydration), `null` = no token.
const getServerToken = () => undefined;

export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const token = useSyncExternalStore<string | null | undefined>(
    subscribeToToken,
    getToken,
    getServerToken
  );
  const authenticated = token !== undefined && isTokenUsable(token);

  useEffect(() => {
    if (token === undefined || authenticated) return;
    if (token) expireSession("absolute");
    router.replace("/login");
  }, [token, authenticated, router]);

  useEffect(() => {
    if (!authenticated || !token) return;
    const claims = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    const timeout = setTimeout(() => expireSession("absolute"), Math.max(0, claims.exp * 1000 - Date.now()));
    return () => clearTimeout(timeout);
  }, [authenticated, token]);

  if (!authenticated) {
    return (
      <p className="p-8 text-center text-sm text-stone-500">Checking session...</p>
    );
  }
  return children;
}
