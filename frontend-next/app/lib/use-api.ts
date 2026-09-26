"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "./api";

type CacheEntry = { promise: Promise<unknown>; data?: unknown; settled: boolean };

// Session analysis is expensive to compute and immutable once a session has
// finished, so successful responses are kept for the lifetime of the page.
// Concurrent requests for the same URL share one fetch; failures are evicted
// so the next render retries.
const cache = new Map<string, CacheEntry>();
const MAX_ENTRIES = 64;

function request(url: string) {
  const existing = cache.get(url);
  if (existing) return existing.promise;

  const entry: CacheEntry = { settled: false, promise: Promise.resolve() };
  entry.promise = fetchJson<unknown>(url).then(
    (data) => {
      entry.data = data;
      entry.settled = true;
      return data;
    },
    (error) => {
      cache.delete(url);
      throw error;
    },
  );
  cache.set(url, entry);
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  return entry.promise;
}

/** Promise-based access to the same cache, for code outside of render (event handlers, effects). */
export function fetchCached<T>(url: string): Promise<T> {
  return request(url) as Promise<T>;
}

export type ApiState<T> = { data: T | undefined; error: string | undefined; loading: boolean };

/** Fetch JSON for `url` (skipped when null), with caching and in-flight de-duplication. */
export function useApi<T>(url: string | null): ApiState<T> {
  const [result, setResult] = useState<{ url: string; data?: T; error?: string } | null>(null);
  const cached = url ? cache.get(url) : undefined;
  const ready = cached?.settled ?? false;

  useEffect(() => {
    if (!url || ready) return;
    let active = true;
    request(url).then(
      (data) => { if (active) setResult({ url, data: data as T }); },
      (error) => { if (active) setResult({ url, error: error instanceof Error ? error.message : "Request failed" }); },
    );
    return () => { active = false; };
  }, [url, ready]);

  if (!url) return { data: undefined, error: undefined, loading: false };
  if (ready) return { data: cached!.data as T, error: undefined, loading: false };
  if (result?.url === url) return { data: result.data, error: result.error, loading: false };
  return { data: undefined, error: undefined, loading: true };
}
