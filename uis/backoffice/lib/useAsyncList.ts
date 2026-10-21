"use client";

import { Dispatch, SetStateAction, useEffect, useState } from "react";

type ListLoader<T> = (key: string, signal: AbortSignal) => Promise<T[]>;

export function useAsyncList<T>(
  key: string,
  load: ListLoader<T>,
  fallbackError: string
): {
  items: T[];
  setItems: Dispatch<SetStateAction<T[]>>;
  loading: boolean;
  error: string | null;
} {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    load(key, controller.signal)
      .then(setItems)
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : fallbackError);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [fallbackError, key, load]);

  return { items, setItems, loading, error };
}