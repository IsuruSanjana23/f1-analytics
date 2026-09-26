"use client";

import { useEffect, useRef, useState } from "react";
import type { Driver } from "./lib/api";
import { teamColor } from "./team-colors";
import type { WorkspaceTab } from "./workspace-state";

const navLinks: [WorkspaceTab, string][] = [["session", "Session"], ["laps", "Driver laps"], ["longruns", "Long runs"], ["telemetry", "Telemetry"]];

type Props = {
  tab: WorkspaceTab;
  year: string;
  race: string;
  session: string;
  seasonOptions: string[];
  raceOptions: string[];
  sessionOptions: string[];
  driverOptions: Driver[];
  selectedDrivers: string[];
  canLoad: boolean;
  status: string;
  connected: boolean;
  onTab: (tab: WorkspaceTab) => void;
  onYear: (value: string) => void;
  onRace: (value: string) => void;
  onSession: (value: string) => void;
  onLoad: () => void;
  onToggleDriver: (code: string) => void;
};

export default function WorkspaceSidebar(props: Props) {
  const { tab, year, race, session, seasonOptions, raceOptions, sessionOptions, driverOptions, selectedDrivers, canLoad, status, connected } = props;
  const driverMenuRef = useRef<HTMLDetailsElement>(null);
  useDismiss(driverMenuRef, () => { if (driverMenuRef.current) driverMenuRef.current.open = false; });

  return <aside className="nav-rail">
    <div className="nav-rail-brand"><span className="mark">TL</span><strong>Tempo Lab</strong></div>
    <nav className="nav-rail-links">{navLinks.map(([value, label]) => <button key={value} type="button" className={tab === value ? "active" : ""} onClick={() => props.onTab(value)}>{label}</button>)}</nav>
    <div className="nav-rail-filters">
      <Select label="Year" value={year || "Select year"} onChange={props.onYear} options={seasonOptions} disabled={!seasonOptions.length} />
      <Select label="Grand Prix" value={race || "Select track"} onChange={props.onRace} options={raceOptions} disabled={!raceOptions.length} />
      <div className="nav-rail-field"><span className="kicker">Session</span><div className="nav-rail-sessions">{sessionOptions.map((option) => <button key={option} type="button" disabled={!race} aria-pressed={session === option} onClick={() => props.onSession(option)}>{option}</button>)}</div></div>
      <button type="button" className="nav-rail-load-btn" disabled={!canLoad} onClick={props.onLoad}>Load data</button>
    </div>
    <div className="nav-rail-compare">
      <span className="kicker">Comparison tray</span>
      <div className="nav-rail-compare-list">
        {selectedDrivers.map((code) => { const driver = driverOptions.find((item) => item.code === code); return <button key={code} type="button" className="driver-pill selected" onClick={() => props.onToggleDriver(code)} title={`Remove ${code} from comparison`}><span className="driver-dot" style={{ background: teamColor(driver?.team ?? undefined) }}></span>{code}<b aria-hidden="true">×</b></button>; })}
        <details className="driver-menu" ref={driverMenuRef}><summary>+ Add driver</summary><div>{driverOptions.filter((driver) => !selectedDrivers.includes(driver.code)).map((driver) => <button key={driver.code} type="button" onClick={() => props.onToggleDriver(driver.code)}><span className="driver-dot" style={{ background: teamColor(driver.team ?? undefined) }}></span>{driver.code}</button>)}</div></details>
      </div>
      <button type="button" className="nav-rail-telemetry-btn" onClick={() => props.onTab("telemetry")}>Open telemetry</button>
    </div>
    <div className="nav-rail-status"><i className={connected ? "online" : "offline"}></i>{status}</div>
  </aside>;
}

/** Call `onDismiss` on a click outside `ref` or on Escape. */
function useDismiss(ref: React.RefObject<HTMLElement | null>, onDismiss: () => void) {
  const dismiss = useRef(onDismiss);
  useEffect(() => { dismiss.current = onDismiss; });
  useEffect(() => {
    function close(event: MouseEvent) { if (ref.current && !ref.current.contains(event.target as Node)) dismiss.current(); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") dismiss.current(); }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [ref]);
}

function Select({ label, value, onChange, options, disabled = false }: { label: string; value: string; onChange: (value: string) => void; options: string[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const container = useRef<HTMLDivElement>(null);
  const filtered = options.filter((option) => option.toLowerCase().includes(query.toLowerCase()));
  useDismiss(container, () => setOpen(false));

  return <div className={`select-label custom-select ${open ? "open" : ""}`} ref={container}><span>{label}</span><button type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => { setOpen((current) => !current); setQuery(""); }}><strong>{value}</strong><i aria-hidden="true">⌄</i></button>{open && <div className="select-menu" role="listbox" aria-label={label}>{options.length > 10 && <div className="select-search"><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${label.toLowerCase()}`} /></div>}<div className="select-options">{filtered.length ? filtered.map((option) => <button type="button" role="option" aria-selected={option === value} className={option === value ? "selected" : ""} key={option} onClick={() => { onChange(option); setOpen(false); setQuery(""); }}>{option}</button>) : <p>No matching options</p>}</div></div>}</div>;
}
