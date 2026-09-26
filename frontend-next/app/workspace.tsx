"use client";

import { useState } from "react";
import Telemetry from "./telemetry";
import PaceChart from "./pace-chart";
import LongRunAnalysis, { type LongRunData } from "./long-run-analysis";
import SessionBoard, { type SessionBoardData } from "./session-board";
import WorkspaceAside from "./workspace-aside";
import WorkspaceSidebar from "./workspace-sidebar";
import { useWorkspaceState, type WorkspaceTab } from "./workspace-state";
import { API, apiUrl, type Driver, type DriverAnalysis } from "./lib/api";
import { compoundClass, lapTime } from "./lib/format";
import { useApi } from "./lib/use-api";
import "./refinements.css";
import "./stitch-theme.css";
import "./nav-rail.css";

function exportSessionCsv(data: SessionBoardData, race: string, session: string) {
  if (!data || !data.fastest_laps.length) return;
  const header = ["Pos", "Driver", "Number", "Team", "Tyre", "Lap time (s)", "Gap (s)", "S1 (s)", "S2 (s)", "S3 (s)", "Vmax (km/h)", "Lap"];
  const rows = data.fastest_laps.map((lap) => [lap.position, lap.driver, lap.driver_number ?? "", lap.team ?? "", lap.compound ?? "", lap.lap_time_seconds ?? "", lap.gap_to_fastest ?? "", lap.sector_1_seconds ?? "", lap.sector_2_seconds ?? "", lap.sector_3_seconds ?? "", lap.top_speed ?? "", lap.lap_number ?? ""]);
  const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${race}-${session}-classification.csv`.replace(/\s+/g, "-").toLowerCase();
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function Workspace({ telemetryPage = false }: { telemetryPage?: boolean }) {
  const state = useWorkspaceState(telemetryPage);
  const { year, race, session, tab, loadedContext, selectedDrivers, metadata } = state;

  const drivers = useApi<{ drivers: Driver[] }>(loadedContext ? apiUrl("/drivers", loadedContext) : null);
  const driverOptions = drivers.data?.drivers ?? [];
  // Drop drivers (e.g. from a shared link) that did not take part in this session.
  const activeDrivers = drivers.data ? selectedDrivers.filter((code) => driverOptions.some((driver) => driver.code === code)) : selectedDrivers;
  const referenceDriver = activeDrivers[0];

  const analysisUrl = loadedContext && referenceDriver ? apiUrl("/driver-analysis", { ...loadedContext, driver: referenceDriver }) : null;
  const analysis = useApi<DriverAnalysis>(analysisUrl);
  const sessionBoard = useApi<NonNullable<SessionBoardData>>(loadedContext && tab === "session" ? apiUrl("/session-analysis", loadedContext) : null);
  const longRunsUrl = loadedContext && activeDrivers.length && tab === "longruns" ? apiUrl("/long-runs", { ...loadedContext, drivers: activeDrivers.join(",") }) : null;
  const longRuns = useApi<NonNullable<LongRunData>>(longRunsUrl);

  const laps = analysis.data?.laps ?? [];
  const summary = analysis.data?.summary ?? {};
  const runs = analysis.data?.long_runs ?? [];
  const timedLaps = laps.filter((lap) => lap.lap_time_seconds != null);
  // The chosen lap belongs to one driver's analysis; switching driver or session resets it.
  const [lapChoice, setLapChoice] = useState<{ url: string; lap: number } | null>(null);
  const selectedLap = lapChoice && lapChoice.url === analysisUrl ? lapChoice.lap : timedLaps[0]?.lap_number;
  const selected = laps.find((lap) => lap.lap_number === selectedLap) || timedLaps[0];
  const selectLap = (lap: number) => { if (analysisUrl) setLapChoice({ url: analysisUrl, lap }); };

  const status = !loadedContext ? metadata.error ? "Metadata unavailable" : "Choose a session, then load data"
    : drivers.error || analysis.error || (!referenceDriver ? "Select a driver" : analysis.loading ? "Loading session" : "API connected");
  const connected = status === "API connected";
  const showLoading = !!loadedContext && (analysis.loading || (tab === "longruns" && longRuns.loading) || (tab === "session" && sessionBoard.loading));

  const headerCopy: Record<WorkspaceTab, { kicker: string; title: string; subtitle: string }> = {
    session: { kicker: "Session overview", title: "Timing classification", subtitle: loadedContext ? `${loadedContext.race} · ${loadedContext.session} · ${sessionBoard.data?.fastest_laps.length ?? driverOptions.length} drivers` : "No session loaded" },
    laps: { kicker: "Driver lap forensics", title: "Lap pace evolution", subtitle: `${referenceDriver || "No driver"} · ${timedLaps.length} timed laps` },
    longruns: { kicker: "Stint intelligence", title: "Long-run pace by tyre and stint", subtitle: `${activeDrivers.length} selected drivers` },
    telemetry: { kicker: "Telemetry comparison", title: "Selected laps · telemetry trace", subtitle: `${referenceDriver || "No driver"} · ${timedLaps.length} timed laps` },
  };
  const activeHeader = headerCopy[tab];
  const telemetry = <Telemetry api={API} year={year} race={race} session={session} drivers={activeDrivers} lap={selected?.lap_number} onRemoveDriver={state.toggleDriver} />;

  if (telemetryPage) {
    return <main className="shell dedicated-telemetry">
      <section className={`content-grid tab-${tab}`}><div className="primary-column">{telemetry}</div></section>
    </main>;
  }

  return <main className="shell nav-rail-shell">
    <WorkspaceSidebar tab={tab} year={year} race={race} session={session} seasonOptions={metadata.seasons} raceOptions={metadata.races} sessionOptions={metadata.sessions} driverOptions={driverOptions} selectedDrivers={activeDrivers} canLoad={state.canLoad} status={status} connected={connected} onTab={state.setTab} onYear={state.chooseYear} onRace={state.chooseRace} onSession={state.chooseSession} onLoad={state.loadData} onToggleDriver={state.toggleDriver} />
    <div className="nav-rail-body">
      <header className="content-header">
        <div className="content-header-title"><h1>{activeHeader.title}</h1><span>{activeHeader.subtitle}</span></div>
        <div className="content-header-actions">
          <button type="button" onClick={() => navigator.clipboard?.writeText(window.location.href)}>Share</button>
          {tab === "session" && <button type="button" onClick={() => exportSessionCsv(sessionBoard.data ?? null, race, session)} disabled={!sessionBoard.data?.fastest_laps.length}>Export CSV</button>}
        </div>
      </header>
      {showLoading && <section className="data-loading" role="status" aria-live="polite"><div className="loading-panel"><span className="loading-signal"></span><span className="kicker">Tempo Lab data service</span><h2>Synchronizing session data</h2><p>{year} · {race} · {session}</p><div className="loading-rail"><i></i></div><small>{activeDrivers.length ? `Loading ${activeDrivers.join(" / ")} analysis` : "Preparing session workspace"}</small></div></section>}
      {!loadedContext ? <section className="session-selection-empty"><span className="kicker">Session setup</span><h2>Choose a year, track, and session</h2><p>{metadata.error ? `The data service is unavailable: ${metadata.error}.` : "Session analysis will load only after you select all three filters and choose Load data."}</p></section> : <section className={`content-grid tab-${tab}`}>
        <div className="primary-column">
          {tab !== "session" && <div className="section-title"><div><span className="kicker">{activeHeader.kicker}</span><h2>{activeHeader.title}</h2></div><span className="chart-note">{activeHeader.subtitle}</span></div>}
          {tab === "session" ? <SessionBoard data={sessionBoard.data ?? null} error={sessionBoard.error} selectedDrivers={activeDrivers} onTelemetry={() => state.setTab("telemetry")} />
            : tab === "longruns" ? <LongRunAnalysis key={longRunsUrl ?? "none"} data={longRuns.data ?? null} error={longRuns.error ?? (activeDrivers.length ? undefined : "Select a driver to compare long runs.")} />
            : tab === "telemetry" ? telemetry
            : <PaceChart laps={laps} selectedLap={selectedLap ?? 0} onSelect={selectLap} />}
          {(tab === "laps" || tab === "telemetry") && <div className="selection-row"><div><span className="kicker">Selected lap</span><h3>{selected ? `Lap ${selected.lap_number} · ${lapTime(selected.lap_time_seconds)}` : "No timed lap"}</h3></div><div className="lap-tags"><span className={`tyre ${compoundClass(selected?.compound || "hard")}`}>{selected?.compound || "-"}</span><span>{selected?.top_speed ? `${selected.top_speed} km/h` : "Top speed -"}</span><span>Tyre life {selected?.tyre_life || "-"}</span></div></div>}
        </div>
        <WorkspaceAside driver={driverOptions.find((driver) => driver.code === referenceDriver)} summary={summary} laps={laps} runs={runs} selected={selected} selectedLap={selectedLap} referenceDriver={referenceDriver} status={status} onClear={() => state.setSelectedDrivers([])} onTelemetry={() => state.setTab("telemetry")} />
      </section>}
      <footer className="workspace-footer"><span><i className={connected ? "online" : "offline"}></i>Data link <b>{connected ? "Live" : status}</b></span><span>Track <b>{race || "--"}</b></span><span>Session <b>{session || "--"}</b></span><span>Year <b>{year || "--"}</b></span><span className="footer-units">Units <b>Metric</b></span></footer>
    </div>
  </main>;
}
