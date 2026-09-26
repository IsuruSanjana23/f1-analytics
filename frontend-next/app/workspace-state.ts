"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiUrl, type Schemas, type SessionContext } from "./lib/api";
import { useApi } from "./lib/use-api";

export const workspaceTabs = ["session", "qualifying", "laps", "longruns", "telemetry"] as const;
export type WorkspaceTab = (typeof workspaceTabs)[number];

function isTab(value: string | null): value is WorkspaceTab {
  return workspaceTabs.includes(value as WorkspaceTab);
}

/** Filter, tab and driver selection, initialised from and mirrored to the URL. */
export function useWorkspaceState(telemetryPage: boolean) {
  const params = useSearchParams();
  const router = useRouter();
  const [yearChoice, setYearChoice] = useState(() => params.get("year") ?? "");
  const [race, setRace] = useState(() => params.get("race") ?? "");
  const [session, setSession] = useState(() => params.get("session") ?? "");
  const [loadedContext, setLoadedContext] = useState<SessionContext | null>(() => {
    const context = { year: params.get("year") ?? "", race: params.get("race") ?? "", session: params.get("session") ?? "" };
    return params.get("loaded") === "1" && context.year && context.race && context.session ? context : null;
  });
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>(() =>
    params.get("loaded") === "1" ? (params.get("drivers") ?? "").split(",").filter(Boolean) : []);
  const [tab, setTab] = useState<WorkspaceTab>(() => {
    const requested = params.get("tab");
    return telemetryPage ? "telemetry" : isTab(requested) ? requested : "session";
  });

  const metadata = useSessionMetadata(yearChoice, race);
  // Until the user picks a season, default to the latest one the API offers.
  const year = yearChoice || metadata.seasons[0] || "";

  useEffect(() => {
    if (!year) return;
    const query = new URLSearchParams({ year, race, session, drivers: selectedDrivers.join(","), tab });
    if (loadedContext) query.set("loaded", "1");
    router.replace(`${tab === "telemetry" ? "/telemetry" : "/"}?${query}`, { scroll: false });
  }, [year, race, session, selectedDrivers, tab, loadedContext, router]);

  function clearAppliedSession() { setLoadedContext(null); setSelectedDrivers([]); }
  function chooseYear(value: string) { setYearChoice(value); setRace(""); setSession(""); clearAppliedSession(); }
  function chooseRace(value: string) { setRace(value); setSession(""); clearAppliedSession(); }
  function chooseSession(value: string) { setSession(value); clearAppliedSession(); }
  function loadData() { if (year && race && session) { setSelectedDrivers([]); setLoadedContext({ year, race, session }); } }
  function toggleDriver(code: string) {
    setSelectedDrivers((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code]);
  }

  return {
    year, race, session, tab, loadedContext, selectedDrivers, metadata,
    setTab, setSelectedDrivers, chooseYear, chooseRace, chooseSession, loadData, toggleDriver,
    canLoad: Boolean(year && race && session && metadata.races.includes(race) && metadata.sessions.includes(session)),
  };
}

function useSessionMetadata(yearChoice: string, race: string) {
  const seasons = useApi<Schemas["Seasons"]>(apiUrl("/seasons"));
  const seasonOptions = seasons.data?.seasons.map(String) ?? [];
  const year = yearChoice || seasonOptions[0] || "";
  const races = useApi<Schemas["Races"]>(year ? apiUrl("/races", { year }) : null);
  const raceOptions = races.data?.races.map((item) => item.name) ?? [];
  // Only ask for sessions once the race is known to belong to the season.
  const sessions = useApi<Schemas["Sessions"]>(year && raceOptions.includes(race) ? apiUrl("/sessions", { year, race }) : null);

  return {
    seasons: seasonOptions,
    races: raceOptions,
    sessions: sessions.data?.sessions.map((item) => item.key) ?? [],
    error: seasons.error || races.error || sessions.error,
  };
}
