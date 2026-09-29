"use client";

import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useSyncExternalStore } from "react";
import { clearToken, getToken, isTokenUsable, subscribeToToken } from "@/lib/auth";

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
    if (token) clearToken();
    router.replace("/login");
  }, [token, authenticated, router]);

  if (!authenticated) {
    return (
      <p className="p-8 text-center text-sm text-stone-500">Checking session...</p>
    );
  }
  return children;
}
