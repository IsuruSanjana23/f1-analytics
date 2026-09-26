export const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

// A cold FastF1 session load can take well over 30 s, so allow generous headroom.
const DEFAULT_TIMEOUT_MS = 120_000;

export type Driver = { code: string; number: string | null; full_name: string | null; team: string | null };
export type Lap = { lap_number: number; lap_time_seconds: number | null; compound: string; stint: number; tyre_life: number; top_speed?: number; classification: string; deleted?: boolean };
export type LongRunSummary = { stint: number; compound: string; lap_count: number; average_pace_seconds: number; pace_dropoff_per_lap: number | null };
export type DriverAnalysis = { laps: Lap[]; summary: Record<string, number | null>; long_runs: LongRunSummary[] };
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
