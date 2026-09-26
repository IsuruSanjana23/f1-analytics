"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Telemetry from "./telemetry";
import PaceChart from "./pace-chart";
import LongRunAnalysis, { type LongRunData } from "./long-run-analysis";
import SessionBoard, { type SessionBoardData } from "./session-board";
import { teamColor } from "./team-colors";
import "./refinements.css";
import "./stitch-theme.css";
import "./nav-rail.css";

type Lap = { lap_number: number; lap_time_seconds: number | null; compound: string; stint: number; tyre_life: number; top_speed?: number; classification: string; deleted?: boolean };
type Driver = { code: string; number: string; full_name: string; team: string };
type SessionContext = { year: string; race: string; session: string };

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";
const workspaceTabs = ["session", "laps", "longruns", "telemetry"];
const navLinks: [string, string][] = [["session", "Session"], ["laps", "Driver laps"], ["longruns", "Long runs"], ["telemetry", "Telemetry"]];
const drivers: Driver[] = [
  { code: "HAM", number: "44", full_name: "Lewis Hamilton", team: "Ferrari" },
  { code: "RUS", number: "63", full_name: "George Russell", team: "Mercedes" },
  { code: "VER", number: "1", full_name: "Max Verstappen", team: "Red Bull Racing" },
];
const demoLaps: Lap[] = Array.from({ length: 22 }, (_, i) => ({ lap_number: i + 1, lap_time_seconds: i % 7 === 0 ? 114 + i : 78.1 + Math.abs(Math.sin(i * 0.7)) * 1.8 + i * 0.05, compound: i < 6 ? "MEDIUM" : i < 16 ? "SOFT" : "HARD", stint: i < 6 ? 1 : i < 16 ? 2 : 3, tyre_life: i < 6 ? i + 1 : i < 16 ? i - 5 : i - 15, top_speed: 321 - (i % 5), classification: i % 7 === 0 ? "slow_lap" : "push_lap" }));

function time(value: number | null | undefined) { if (value == null || !Number.isFinite(value)) return "-"; return `${Math.floor(value / 60)}:${(value % 60).toFixed(3).padStart(6, "0")}`; }
function compoundClass(value: string) { return (value || "unknown").toLowerCase(); }

async function fetchJson<T>(url: string, timeoutMs = 30000): Promise<T> {
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
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function exportSessionCsv(data: SessionBoardData, race: string, session: string) {
  if (!data || !data.fastest_laps.length) return;
  const header = ["Pos", "Driver", "Number", "Team", "Tyre", "Lap time (s)", "Gap (s)", "S1 (s)", "S2 (s)", "S3 (s)", "Vmax (km/h)", "Lap"];
  const rows = data.fastest_laps.map((lap) => [lap.position, lap.driver, lap.driver_number ?? "", lap.team ?? "", lap.compound ?? "", lap.lap_time_seconds ?? "", lap.gap_to_fastest ?? "", lap.sector_1_seconds ?? "", lap.sector_2_seconds ?? "", lap.sector_3_seconds ?? "", lap.top_speed ?? "", lap.lap_number ?? ""]);
  const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${race}-${session}-classification.csv`.replace(/\s+/g, "-").toLowerCase();
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function Home({ telemetryPage = false }: { telemetryPage?: boolean }) {
  const router = useRouter(); const pathname = usePathname();
  const [hydrated, setHydrated] = useState(false);
  const [year, setYear] = useState("2025");
  const [race, setRace] = useState("Australian Grand Prix");
  const [session, setSession] = useState("FP1");
  const [loadedContext, setLoadedContext] = useState<SessionContext | null>(null);
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>([]);
  const [tab, setTab] = useState("session");
  const [seasonOptions, setSeasonOptions] = useState<string[]>(["2025", "2024", "2023"]);
  const [raceOptions, setRaceOptions] = useState<string[]>(["Australian Grand Prix", "Japanese Grand Prix", "Bahrain Grand Prix"]);
  const [sessionOptions, setSessionOptions] = useState<string[]>(["FP1", "FP2", "FP3", "Q", "R"]);
  const [driverOptions, setDriverOptions] = useState<Driver[]>(drivers);
  const [summary, setSummary] = useState<Record<string, number | null>>({});
  const [runs, setRuns] = useState<{ stint: number; compound: string; lap_count: number; average_pace_seconds: number; pace_dropoff_per_lap: number | null }[]>([]);
  const [longRunData, setLongRunData] = useState<LongRunData>(null);
  const [sessionBoardData, setSessionBoardData] = useState<SessionBoardData>(null);
  const [driverLoading, setDriverLoading] = useState(false);
  const [longRunsLoading, setLongRunsLoading] = useState(false);
  const [sessionBoardLoading, setSessionBoardLoading] = useState(false);
  const [laps, setLaps] = useState<Lap[]>([]); const [selectedLap, setSelectedLap] = useState(13); const [status, setStatus] = useState("Loading session");
  const driverMenuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function close(event: MouseEvent) { if (driverMenuRef.current && driverMenuRef.current.open && !driverMenuRef.current.contains(event.target as Node)) driverMenuRef.current.open = false; }
    function escape(event: KeyboardEvent) { if (event.key === "Escape" && driverMenuRef.current) driverMenuRef.current.open = false; }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wasLoaded = params.get("loaded") === "1";
    setYear(params.get("year") || "2025");
    setRace(params.get("race") || "Australian Grand Prix");
    setSession(params.get("session") || "FP1");
    setSelectedDrivers(wasLoaded ? params.get("drivers")?.split(",").filter(Boolean) || [] : []);
    if (wasLoaded) setLoadedContext({ year: params.get("year") || "2025", race: params.get("race") || "Australian Grand Prix", session: params.get("session") || "FP1" });
    const requestedTab = params.get("tab") || "session";
    setTab(telemetryPage ? "telemetry" : workspaceTabs.includes(requestedTab) ? requestedTab : "session");
    setHydrated(true);
  }, []);

  useEffect(() => {
    async function loadSeasons() {
      try {
        const data = await fetchJson<{ seasons: number[] }>(`${API}/seasons`);
        setSeasonOptions(data.seasons.map((value: number) => String(value)));
      } catch { setStatus("Metadata unavailable"); }
    }
    loadSeasons();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    let current = true;
    async function loadRaces() {
      try {
        const data = await fetchJson<{ races: { name: string }[] }>(`${API}/races?year=${year}`);
        if (!current) return;
        const names = data.races.map((item: { name: string }) => item.name);
        setRaceOptions(names);
        if (race && !names.includes(race)) setRace("");
      } catch { setStatus("Metadata unavailable"); }
    }
    loadRaces();
    return () => { current = false; };
  }, [hydrated, year]);

  useEffect(() => {
    if (!hydrated) return;
    let current = true;
    async function loadSessions() {
      try {
        const data = await fetchJson<{ sessions: { key: string }[] }>(`${API}/sessions?year=${year}&race=${encodeURIComponent(race)}`);
        if (!current) return;
        const keys = data.sessions.map((item: { key: string }) => item.key);
        setSessionOptions(keys);
        if (session && !keys.includes(session)) setSession("");
      } catch { setStatus("Metadata unavailable"); }
    }
    if (race) loadSessions();
    return () => { current = false; };
  }, [hydrated, year, race]);

  useEffect(() => {
    if (!hydrated || !loadedContext) return;
    let current = true;
    async function loadDrivers() {
      try {
        const data = await fetchJson<{ drivers: Driver[] }>(`${API}/drivers?year=${loadedContext!.year}&race=${encodeURIComponent(loadedContext!.race)}&session=${loadedContext!.session}`);
        if (!current) return;
        setDriverOptions(data.drivers);
        const available = new Set(data.drivers.map((driver: Driver) => driver.code));
        setSelectedDrivers(current => current.filter(code => available.has(code)));
      } catch { setStatus("Metadata unavailable"); }
    }
    loadDrivers();
    return () => { current = false; };
  }, [hydrated, loadedContext]);

  useEffect(() => {
    if (!hydrated) return;
    const query = new URLSearchParams({ year, race, session, drivers: selectedDrivers.join(","), tab });
    if (loadedContext) query.set("loaded", "1");
    const target = tab === "telemetry" ? "/telemetry" : "/";
    router.replace(`${target}?${query.toString()}`, { scroll: false });
  }, [hydrated, year, race, session, selectedDrivers, tab, loadedContext, pathname, router]);

  useEffect(() => {
    if (!hydrated || !loadedContext) return;
    let active = true;
    setStatus(selectedDrivers.length ? "Loading session" : "Select a driver"); setLaps([]); setSummary({}); setRuns([]); setDriverLoading(selectedDrivers.length > 0);
    if (!selectedDrivers.length) return;
    async function load() {
      try {
        const code = selectedDrivers[0];
        const data = await fetchJson<{ laps: Lap[]; summary: Record<string, number | null>; long_runs: { stint: number; compound: string; lap_count: number; average_pace_seconds: number; pace_dropoff_per_lap: number | null }[] }>(`${API}/driver-analysis?year=${loadedContext!.year}&race=${encodeURIComponent(loadedContext!.race)}&session=${loadedContext!.session}&driver=${code}`);
        if (!active) return; setSelectedLap(data.laps?.find((l) => l.lap_time_seconds != null)?.lap_number || 1); setLaps(data.laps || []); setSummary(data.summary || {}); setRuns(data.long_runs || []); setStatus("API connected");
      } catch (error) { if (active) { setLaps([]); setStatus(error instanceof Error ? error.message : "Session unavailable"); } } finally { if (active) setDriverLoading(false); }
    }
    load();
    return () => { active = false; };
  }, [hydrated, loadedContext, selectedDrivers]);

  useEffect(() => {
    if (!hydrated || !loadedContext || tab !== "session") { setSessionBoardLoading(false); return; }
    let active = true;
    setSessionBoardLoading(true);
    fetchJson<SessionBoardData>(`${API}/session-analysis?${new URLSearchParams(loadedContext!)}`).then((data) => { if (active) setSessionBoardData(data); }).catch(() => { if (active) setSessionBoardData(null); }).finally(() => { if (active) setSessionBoardLoading(false); });
    return () => { active = false; };
  }, [hydrated, tab, loadedContext]);

  useEffect(() => {
    if (!hydrated || !loadedContext || !selectedDrivers.length) { setLongRunData(null); setLongRunsLoading(false); return; }
    let active = true;
    setLongRunsLoading(true);
    async function loadLongRuns() {
      try {
        const data = await fetchJson<LongRunData>(`${API}/long-runs?year=${loadedContext!.year}&race=${encodeURIComponent(loadedContext!.race)}&session=${loadedContext!.session}&drivers=${selectedDrivers.join(",")}`);
        if (active) setLongRunData(data);
      } catch { if (active) setLongRunData(null); } finally { if (active) setLongRunsLoading(false); }
    }
    loadLongRuns();
    return () => { active = false; };
  }, [hydrated, loadedContext, selectedDrivers]);

  const timedLaps = useMemo(() => laps.filter((lap) => lap.lap_time_seconds != null), [laps]);
  const selected = laps.find((lap) => lap.lap_number === selectedLap) || timedLaps[0];
  const min = Math.min(...timedLaps.map((lap) => lap.lap_time_seconds || 0)); const max = Math.max(...timedLaps.map((lap) => lap.lap_time_seconds || 0));
  const showLoading = !!loadedContext && (!hydrated || driverLoading || (tab === "longruns" && longRunsLoading) || (tab === "session" && sessionBoardLoading));
  function toggleDriver(code: string) { setSelectedDrivers((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code]); }
  function clearAppliedSession() { setLoadedContext(null); setSelectedDrivers([]); setDriverOptions([]); setLaps([]); setSummary({}); setRuns([]); setLongRunData(null); setSessionBoardData(null); setStatus("Choose a session, then load data"); }
  function chooseYear(value: string) { setYear(value); setRace(""); setSession(""); setRaceOptions([]); setSessionOptions([]); clearAppliedSession(); }
  function chooseRace(value: string) { setRace(value); setSession(""); setSessionOptions([]); clearAppliedSession(); }
  function chooseSession(value: string) { setSession(value); clearAppliedSession(); }
  function loadData() { if (!year || !race || !session) return; setSelectedDrivers([]); setLoadedContext({ year, race, session }); setStatus("Loading session"); }
  const canLoad = Boolean(year && race && session && raceOptions.includes(race) && sessionOptions.includes(session));

  const headerCopy: Record<string, { kicker: string; title: string; subtitle: string }> = {
    session: { kicker: "Session overview", title: "Timing classification", subtitle: `${race} · ${session} · ${sessionBoardData?.fastest_laps.length ?? driverOptions.length} drivers` },
    laps: { kicker: "Driver lap forensics", title: "Lap pace evolution", subtitle: `${selectedDrivers[0] || "No driver"} · ${timedLaps.length} timed laps` },
    longruns: { kicker: "Stint intelligence", title: "Long-run pace by tyre and stint", subtitle: `${selectedDrivers.length} selected drivers` },
    telemetry: { kicker: "Telemetry comparison", title: "Selected laps · telemetry trace", subtitle: `${selectedDrivers[0] || "No driver"} · ${timedLaps.length} timed laps` },
  };
  const activeHeader = headerCopy[tab] || headerCopy.session;

  if (telemetryPage) {
    return <main className="shell dedicated-telemetry">
      <section className={`content-grid tab-${tab}`}><div className="primary-column"><Telemetry api={API} year={year} race={race} session={session} drivers={selectedDrivers} lap={selected?.lap_number} onRemoveDriver={toggleDriver} /></div></section>
    </main>;
  }

  return <main className="shell nav-rail-shell">
    <aside className="nav-rail">
      <div className="nav-rail-brand"><span className="mark">TL</span><strong>Tempo Lab</strong></div>
      <nav className="nav-rail-links">{navLinks.map(([value, label]) => <button key={value} type="button" className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{label}</button>)}</nav>
      <div className="nav-rail-filters">
        <Select label="Year" value={year} onChange={chooseYear} options={seasonOptions} />
        <Select label="Grand Prix" value={race || "Select track"} onChange={chooseRace} options={raceOptions} disabled={!raceOptions.length} />
        <div className="nav-rail-field"><span className="kicker">Session</span><div className="nav-rail-sessions">{sessionOptions.map((option) => <button key={option} type="button" disabled={!race} aria-pressed={session === option} onClick={() => chooseSession(option)}>{option}</button>)}</div></div>
        <button type="button" className="nav-rail-load-btn" disabled={!canLoad} onClick={loadData}>Load data</button>
      </div>
      <div className="nav-rail-compare">
        <span className="kicker">Comparison tray</span>
        <div className="nav-rail-compare-list">
          {selectedDrivers.map((code) => { const driver = driverOptions.find((item) => item.code === code); return <button key={code} type="button" className="driver-pill selected" onClick={() => toggleDriver(code)} title={`Remove ${code} from comparison`}><span className="driver-dot" style={{ background: teamColor(driver?.team) }}></span>{code}<b aria-hidden="true">×</b></button>; })}
          <details className="driver-menu" ref={driverMenuRef}><summary>+ Add driver</summary><div>{driverOptions.filter((driver) => !selectedDrivers.includes(driver.code)).map((driver) => <button key={driver.code} type="button" onClick={() => toggleDriver(driver.code)}><span className="driver-dot" style={{ background: teamColor(driver.team) }}></span>{driver.code}</button>)}</div></details>
        </div>
        <button type="button" className="nav-rail-telemetry-btn" onClick={() => setTab("telemetry")}>Open telemetry</button>
      </div>
      <div className="nav-rail-status"><i className={status === "API connected" ? "online" : "offline"}></i>{status === "API connected" ? "API connected" : status}</div>
    </aside>
    <div className="nav-rail-body">
      <header className="content-header">
        <div className="content-header-title"><h1>{activeHeader.title}</h1><span>{activeHeader.subtitle}</span></div>
        <div className="content-header-actions">
          <button type="button" onClick={() => navigator.clipboard?.writeText(window.location.href)}>Share</button>
          {tab === "session" && <button type="button" onClick={() => exportSessionCsv(sessionBoardData, race, session)} disabled={!sessionBoardData?.fastest_laps.length}>Export CSV</button>}
        </div>
      </header>
      {showLoading && <section className="data-loading" role="status" aria-live="polite"><div className="loading-panel"><span className="loading-signal"></span><span className="kicker">Tempo Lab data service</span><h2>Synchronizing session data</h2><p>{year} · {race} · {session}</p><div className="loading-rail"><i></i></div><small>{selectedDrivers.length ? `Loading ${selectedDrivers.join(" / ")} analysis` : "Preparing session workspace"}</small></div></section>}
      {!loadedContext ? <section className="session-selection-empty"><span className="kicker">Session setup</span><h2>Choose a year, track, and session</h2><p>Session analysis will load only after you select all three filters and choose Load data.</p></section> : <section className={`content-grid tab-${tab}`}><div className="primary-column">{tab !== "session" && <div className="section-title"><div><span className="kicker">{activeHeader.kicker}</span><h2>{activeHeader.title}</h2></div><span className="chart-note">{activeHeader.subtitle}</span></div>}{tab === "session" ? <SessionBoard data={sessionBoardData} selectedDrivers={selectedDrivers} onTelemetry={() => setTab("telemetry")} /> : tab === "longruns" ? <LongRunAnalysis data={longRunData} /> : tab === "telemetry" ? <Telemetry api={API} year={year} race={race} session={session} drivers={selectedDrivers} lap={selected?.lap_number} onRemoveDriver={toggleDriver} /> : <PaceChart laps={laps} selectedLap={selectedLap} onSelect={setSelectedLap} min={min} max={max} />}
        {(tab === "laps" || tab === "telemetry") && <div className="selection-row"><div><span className="kicker">Selected lap</span><h3>{selected ? `Lap ${selected.lap_number} · ${time(selected.lap_time_seconds)}` : "No timed lap"}</h3></div><div className="lap-tags"><span className={`tyre ${compoundClass(selected?.compound || "hard")}`}>{selected?.compound || "-"}</span><span>{selected?.top_speed ? `${selected.top_speed} km/h` : "Top speed -"}</span><span>Tyre life {selected?.tyre_life || "-"}</span></div></div>}
      </div><aside className="aside"><div className="driver-card"><div className="number">{driverOptions.find((d) => d.code === selectedDrivers[0])?.number || "--"}</div><div><span className="kicker">Reference driver</span><h2>{driverOptions.find((d) => d.code === selectedDrivers[0])?.full_name || "Select a driver"}</h2><p>{driverOptions.find((d) => d.code === selectedDrivers[0])?.team || "--"}</p></div></div><div className="metrics"><Metric label="Fastest lap" value={time(summary.fastest_lap_seconds)} /><Metric label="Median pace" value={time(summary.median_lap_seconds)} /><Metric label="Best top speed" value={laps.length ? `${Math.max(...laps.map(l => l.top_speed || 0))} km/h` : "--"} /><Metric label="Long runs" value={`${runs.length} detected`} /></div><div className="read-card"><div className="card-head"><h3>Race engineer read</h3><span className="signal">●</span></div><p>{laps.length} laps recorded. {laps.filter(l => l.lap_time_seconds == null).length} laps have no complete time. {runs.length} representative long runs detected.</p><div className="tags"><span>{status}</span></div></div><div className="compare-card"><div className="card-head"><h3>Comparison tray</h3><button onClick={() => setSelectedDrivers([])}>Clear</button></div>{selectedDrivers.length ? selectedDrivers.slice(0, 1).map((code, index) => <div className="compare-item" key={code}><b>{String.fromCharCode(65 + index)}</b><span><strong>{code} · Lap {selectedLap}</strong><small>{time(selected?.lap_time_seconds)} · {selected?.compound}</small></span></div>) : <p className="muted">Select drivers above to begin a comparison.</p>}<button className="compare-button" onClick={() => setTab("telemetry")}>Open telemetry view ↗</button></div></aside></section>}
      <footer className="workspace-footer"><span><i className={status === "API connected" ? "online" : "offline"}></i>Data link <b>{status === "API connected" ? "Live" : status}</b></span><span>Track <b>{race}</b></span><span>Session <b>{session}</b></span><span>Year <b>{year}</b></span><span className="footer-units">Units <b>Metric</b></span></footer>
    </div>
  </main>;
}

function Select({ label, value, onChange, options, disabled = false }: { label: string; value: string; onChange: (value: string) => void; options: string[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const container = useRef<HTMLDivElement>(null);
  const filtered = options.filter((option) => option.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    function close(event: MouseEvent) { if (container.current && !container.current.contains(event.target as Node)) setOpen(false); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, []);

  return <div className={`select-label custom-select ${open ? "open" : ""}`} ref={container}><span>{label}</span><button type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => { setOpen((current) => !current); setQuery(""); }}><strong>{value}</strong><i aria-hidden="true">⌄</i></button>{open && <div className="select-menu" role="listbox" aria-label={label}>{options.length > 10 && <div className="select-search"><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${label.toLowerCase()}`} /></div>}<div className="select-options">{filtered.length ? filtered.map((option) => <button type="button" role="option" aria-selected={option === value} className={option === value ? "selected" : ""} key={option} onClick={() => { onChange(option); setOpen(false); setQuery(""); }}>{option}</button>) : <p>No matching options</p>}</div></div>}</div>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
