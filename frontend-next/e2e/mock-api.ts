import type { Page, Route } from "@playwright/test";
import type { components } from "../app/lib/api-types";

type Schemas = components["schemas"];
type Handler = (query: URLSearchParams) => unknown;

const teams = ["Ferrari", "McLaren", "Red Bull Racing", "Mercedes", "Aston Martin", "Alpine", "Williams", "RB", "Kick Sauber", "Haas F1 Team"];
export const codes = ["LEC", "NOR", "VER", "RUS", "ALO", "GAS", "ALB", "TSU", "HUL", "OCO", "HAM", "PIA", "PER", "ANT", "STR", "DOO", "SAI", "LAW", "BOR", "BEA"];

const event: Schemas["EventSummary"] = { year: 2024, name: "Italian Grand Prix", official_name: null, round: 16, circuit: "Monza", country: "Italy" };
const session: Schemas["SessionSummary"] = { name: "Practice 2", type: "race_pace", date: "2024-08-30" };
const drivers: Schemas["Driver"][] = codes.map((code, index) => ({ code, number: String(index + 1), full_name: code, team: teams[index % 10] }));

function lapSummary(driver: string, lap: number, seconds: number, compound = "SOFT"): Schemas["LapSummary"] {
  return {
    driver, driver_number: "1", team: teams[codes.indexOf(driver) % 10], lap_number: lap, lap_time_seconds: seconds,
    sector_1_seconds: 26.8, sector_2_seconds: 27.1, sector_3_seconds: seconds - 53.9, compound, tyre_life: lap,
    fresh_tyres: true, stint: compound === "SOFT" ? 1 : 2, pit_in: false, pit_out: false, deleted: false,
    top_speed: 320 + lap, classification: seconds > 90 ? "slow_lap" : "push_lap",
  };
}

function longRun(driver: string, stint: number, compound: string, base: number): Schemas["LongRun"] {
  const laps = Array.from({ length: 6 }, (_, i) => ({
    lap_number: stint * 10 + i, lap_time_seconds: base + i * 0.08 + (i === 3 ? 4 : 0), tyre_life: i + 2,
    default_included: i !== 3, exclusion_reason: i === 3 ? ("slower_than_stint_trend" as const) : null,
  }));
  return {
    run_id: `${driver}:${stint}:${compound}`, driver, stint, compound, lap_count: 5, average_pace_seconds: base + 0.2,
    median_pace_seconds: base + 0.2, best_lap_seconds: base, worst_lap_seconds: base + 0.4, pace_dropoff_per_lap: 0.03,
    tyre_degradation_per_lap: 0.08, tyre_life_start: 2, tyre_life_end: 7, laps_used: laps.filter((l) => l.default_included).map((l) => l.lap_number),
    laps_excluded: [{ lap_number: stint * 10 + 3, reason: "slower_than_stint_trend" }], laps,
  };
}

function qualifying(withSegments: boolean): Schemas["QualifyingAnalysis"] {
  const segments: Schemas["QualifyingSegment"][] = ([["Q1", 20, 81.2], ["Q2", 15, 80.6], ["Q3", 10, 80.1]] as const).map(([segment, count, base]) => ({
    segment,
    results: codes.slice(0, count).map((driver, i) => ({
      position: i + 1, driver, team: teams[i % 10], lap_number: 3, lap_time_seconds: +(base + i * 0.07).toFixed(3),
      gap_to_segment_best: +(i * 0.07).toFixed(3), compound: "SOFT",
    })),
  }));
  const attempts: Schemas["QualifyingAttempt"][] = segments.flatMap((segment) => segment.results.map((result) => ({
    ...lapSummary(result.driver, result.lap_number, result.lap_time_seconds),
    gap_to_session_best: 0, segment: withSegments ? segment.segment : null, gap_to_segment_best: withSegments ? result.gap_to_segment_best : null,
  })));
  const best_laps = segments[2].results.map((result) => ({ ...lapSummary(result.driver, 3, result.lap_time_seconds), position: result.position, gap_to_fastest: result.gap_to_segment_best }));
  return { event, session: { ...session, type: "qualifying" }, drivers, best_laps, top_speeds: [], segments: withSegments ? segments : [], attempts };
}

const telemetry: Schemas["TelemetrySample"][] = Array.from({ length: 200 }, (_, i) => ({
  distance: i * 29, speed: 200 + 100 * Math.sin(i / 12), rpm: 11000, gear: 7, throttle: i % 40 < 30 ? 100 : 0,
  brake: i % 40 >= 32, drs: 0, x: 1000 * Math.cos(i / 32), y: 700 * Math.sin(i / 32),
}));

const handlers: Record<string, Handler> = {
  health: () => ({ status: "ok" }),
  seasons: () => ({ seasons: [2026, 2025, 2024] }),
  races: (q) => ({ year: Number(q.get("year")), races: ["Italian Grand Prix", "Monaco Grand Prix"].map((name, i) => ({ round: i + 1, name, official_name: null, location: null, country: null, date: "2024-09-01" })) }),
  sessions: (q) => ({ year: 2024, race: q.get("race"), sessions: ["FP1", "FP2", "FP3", "Q", "R"].map((key) => ({ name: key, key, date: null, type: key === "Q" ? "qualifying" : "race_pace" })) }),
  drivers: () => ({ year: 2024, race: "Italian Grand Prix", session: "FP2", drivers }),
  "driver-analysis": (q) => {
    const driver = q.get("driver") ?? "LEC";
    const laps = Array.from({ length: 14 }, (_, i) => lapSummary(driver, i + 1, i % 6 === 0 ? 95 + i : 80.5 + i * 0.05, i < 7 ? "SOFT" : "MEDIUM"));
    return { driver: drivers.find((d) => d.code === driver), event, session, laps, long_runs: [longRun(driver, 2, "MEDIUM", 81.2)],
      summary: { lap_count: 14, timed_lap_count: 14, fastest_lap_seconds: 80.5, average_lap_seconds: 81.4, median_lap_seconds: 81.1, best_sector_1_seconds: 26.8, best_sector_2_seconds: 27.1, best_sector_3_seconds: 26.6 } };
  },
  "session-analysis": () => ({
    event, session, drivers, top_speeds: [], long_runs: [], tyre_summary: [],
    fastest_laps: codes.map((driver, i) => ({ ...lapSummary(driver, 5, 80.5 + i * 0.1), position: i + 1, gap_to_fastest: +(i * 0.1).toFixed(3) })),
  }),
  "qualifying-analysis": (q) => qualifying(!q.get("race")?.startsWith("Monaco")),
  "long-runs": (q) => {
    const selected = (q.get("drivers") ?? "").split(",").filter(Boolean);
    return { event: { year: 2024, race: "Italian Grand Prix" }, session: "FP2", selected_drivers: selected, min_laps: 4, fuel_correction_per_lap: 0.055,
      runs: selected.flatMap((driver, i) => [longRun(driver, 1, "SOFT", 81 + i * 0.2), longRun(driver, 2, "MEDIUM", 81.6 + i * 0.2)]), tyre_rankings: [], session_tyre_ranking: [] };
  },
  "lap-telemetry": (q) => ({ summary: lapSummary(q.get("driver") ?? "LEC", Number(q.get("lap")), 80.5), telemetry }),
  "track-layout": () => ({ year: 2024, race: "Italian Grand Prix", session: "FP2", official_circuit_url: null, points: telemetry.map((t, i) => ({ x: t.x!, y: t.y!, progress: i / 199 })) }),
};

export type MockApi = { calls: string[]; fail: Set<string> };

/** Serve every /api request from the handlers above; endpoints in `fail` answer 503. */
export async function mockApi(page: Page): Promise<MockApi> {
  const api: MockApi = { calls: [], fail: new Set() };
  await page.route("http://mock.local/api/**", async (route: Route) => {
    const url = new URL(route.request().url());
    const name = url.pathname.replace("/api/", "");
    api.calls.push(name);
    const headers = { "access-control-allow-origin": "*" };
    if (api.fail.has(name)) return route.fulfill({ status: 503, headers, json: { detail: "F1 timing data is temporarily unavailable" } });
    const handler = handlers[name];
    if (!handler) return route.fulfill({ status: 404, headers, json: { detail: `No mock for ${name}` } });
    return route.fulfill({ headers, json: handler(url.searchParams) });
  });
  return api;
}
