import type { components } from "./api-types";

export const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

// A cold FastF1 session load can take well over 30 s, so allow generous headroom.
const DEFAULT_TIMEOUT_MS = 120_000;

// Response types are generated from the backend's OpenAPI schema (npm run generate:api).
export type Schemas = components["schemas"];
export type Driver = Schemas["Driver"];
export type Lap = Schemas["LapSummary"];
export type LongRunSummary = Schemas["LongRun"];
export type DriverAnalysis = Schemas["DriverAnalysis"];
export type SessionContext = { year: string; race: string; session: string };

export function apiUrl(path: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams(params).toString();
  return `${API}${path}${query ? `?${query}` : ""}`;
}

export async function fetchJson<T>(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(typeof data?.detail === "string" ? data.detail : "Data service unavailable");
    return data as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The data service did not respond in time");
    }
    if (error instanceof TypeError) throw new Error("Data service unreachable");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
