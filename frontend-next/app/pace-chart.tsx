"use client";

import { useState } from "react";

import type { Lap } from "./lib/api";

const colors: Record<string, string> = { SOFT: "#ff6984", MEDIUM: "#e6cf57", HARD: "#dee5e7", INTERMEDIATE: "#58c493", WET: "#5c9fe8" };
const format = (n: number | null | undefined) => n == null || !Number.isFinite(n) ? "--" : `${Math.floor(n / 60)}:${(n % 60).toFixed(3).padStart(6, "0")}`;

export default function PaceChart({ laps, selectedLap, onSelect }: { laps: Lap[]; selectedLap: number; onSelect: (n: number) => void }) {
  const [mode, setMode] = useState("pace");
  const [clean, setClean] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [windowSize, setWindowSize] = useState(0);
  const [start, setStart] = useState(0);
  const ordered = [...laps].sort((a, b) => a.lap_number - b.lap_number);
  const count = ordered.length;
  const size = windowSize ? Math.min(windowSize, count) : count;
  const offset = Math.min(start, Math.max(0, count - size));
  const visible = ordered.slice(offset, offset + size);
  const value = (l: Lap) => mode === "pace" ? l.lap_time_seconds : l.top_speed;
  const isClean = (l: Lap) => !l.deleted && l.classification === "push_lap";
  const plotted = visible.filter(l => Number.isFinite(value(l)) && (!clean || isClean(l)));
  const vals = plotted.map(l => value(l) as number);
  const low = vals.length ? Math.min(...vals) : 0;
  const high = vals.length ? Math.max(...vals) : 1;
  const pad = Math.max((high - low) * .12, mode === "pace" ? .25 : 2);
  const first = visible[0]?.lap_number ?? 1;
  const last = visible.at(-1)?.lap_number ?? first + 1;
  const x = (n: number) => 78 + (n - first) / Math.max(1, last - first) * 774;
  const y = (n: number) => 36 + (high + pad - n) / (high - low + 2 * pad) * 252;
  const hovered = plotted.find(l => l.lap_number === hover);
  const focused = hovered || visible.find(l => l.lap_number === selectedLap);
  const label = (v: number) => mode === "pace" ? format(v) : `${v.toFixed(0)}`;
  const ticks = Array.from({ length: 6 }, (_, i) => low - pad + (high - low + 2 * pad) * i / 5);
  const lapTicks = Array.from(new Set(Array.from({ length: Math.min(9, visible.length) }, (_, i) => Math.round(first + (last - first) * i / Math.max(1, Math.min(9, visible.length) - 1)))));
  return <section className="pace-lab">
    <div className="pace-toolbar"><div className="segmented" aria-label="Chart metric">{[["pace", "Lap time"], ["speed", "Top speed"]].map(([key, name]) => <button key={key} aria-pressed={mode === key} onClick={() => setMode(key)}>{name}</button>)}</div><label className="clean-toggle"><input type="checkbox" checked={clean} onChange={e => setClean(e.target.checked)} />Push laps only</label><select aria-label="Chart zoom" value={windowSize} onChange={e => { setWindowSize(Number(e.target.value)); setStart(0); }}><option value={0}>Full session</option><option value={10}>10-lap window</option><option value={20}>20-lap window</option></select></div>
    <div className="pace-readout"><span>{mode === "pace" ? "LAP TIME / M:SS" : "SPEED / KM/H"}</span><span>{plotted.length} plotted <b>/</b> {visible.length} laps</span></div>
    {!plotted.length ? <div className="chart-empty">No {clean ? "push-lap " : ""}data available in this window.</div> : <div className="pace-plot"><svg viewBox="0 0 900 340" role="img" aria-label="Lap chart with tyre colors and lap-number axis">
      {ticks.map(v => <g key={v}><line x1={78} x2={852} y1={y(v)} y2={y(v)} stroke="#29302f" strokeDasharray="3 5" /><text x={64} y={y(v) + 4} textAnchor="end">{label(v)}</text></g>)}
      {lapTicks.map(n => <g key={n}><line x1={x(n)} x2={x(n)} y1={36} y2={288} stroke="#202725" /><text x={x(n)} y={314} textAnchor="middle">{n}</text></g>)}
      <text x={465} y={337} textAnchor="middle">LAP NUMBER</text>
      {plotted.slice(1).map((l, i) => { const prev = plotted[i]; const sameRun = l.stint === prev.stint; const adjacentLap = l.lap_number === prev.lap_number + 1; return sameRun && (clean || adjacentLap) ? <line key={l.lap_number} x1={x(prev.lap_number)} y1={y(value(prev)!)} x2={x(l.lap_number)} y2={y(value(l)!)} stroke={colors[l.compound ?? ""] || "#80958d"} strokeWidth={1.8} opacity={.75} /> : null; })}
      {focused && <line x1={x(focused.lap_number)} x2={x(focused.lap_number)} y1={30} y2={292} stroke="#b1dc88" strokeDasharray="4 4" opacity={.6} />}
      {plotted.map(l => <g key={l.lap_number} role="button" tabIndex={0} aria-label={`Lap ${l.lap_number}, ${label(value(l)!)}, ${l.compound}`} onMouseEnter={() => setHover(l.lap_number)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(l.lap_number)} onBlur={() => setHover(null)} onClick={() => onSelect(l.lap_number)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(l.lap_number); } }}>
        <circle cx={x(l.lap_number)} cy={y(value(l)!)} r={12} fill="transparent" />
        {l.lap_number === selectedLap && <circle cx={x(l.lap_number)} cy={y(value(l)!)} r={9} fill="none" stroke="#d8edc7" strokeWidth={1.5} />}
        <circle cx={x(l.lap_number)} cy={y(value(l)!)} r={4.5} fill={isClean(l) ? colors[l.compound ?? ""] || "#879995" : "#111815"} stroke={colors[l.compound ?? ""] || "#879995"} strokeWidth={2} />
      </g>)}
      {hovered && <g pointerEvents="none"><rect x={Math.min(x(hovered.lap_number) + 12, 660)} y={Math.max(y(value(hovered)!) - 64, 8)} width={180} height={50} fill="#181b22" stroke="#46efda" /><text x={Math.min(x(hovered.lap_number) + 20, 668)} y={Math.max(y(value(hovered)!) - 43, 28)} fill="#46efda">LAP {hovered.lap_number} · {format(hovered.lap_time_seconds)}</text><text x={Math.min(x(hovered.lap_number) + 20, 668)} y={Math.max(y(value(hovered)!) - 25, 46)} fill="#b8c4c0">{hovered.compound} · TYRE AGE {hovered.tyre_life ?? "--"}{mode === "speed" ? ` · ${hovered.top_speed ?? "--"} KM/H` : ""}</text></g>}
    </svg></div>}
    <div className="chart-hover" aria-live="polite"><strong>{focused ? `LAP ${focused.lap_number}` : "NO LAP SELECTED"}</strong><b>{focused ? format(focused.lap_time_seconds) : "--"}</b>{mode === "speed" && <span>{focused?.top_speed ?? "--"} km/h</span>}<span>{focused?.compound || "--"}</span><span>Tyre age {focused?.tyre_life ?? "--"}</span><span>{focused?.classification?.replaceAll("_", " ") || "--"}</span></div>
    {size < count && <input className="chart-pan" aria-label="Pan lap window" type="range" min={0} max={count - size} value={offset} onChange={e => setStart(Number(e.target.value))} />}
    <div className="pace-legend">{Object.entries(colors).filter(([c]) => laps.some(l => l.compound === c)).map(([c, color]) => <span key={c}><i style={{ background: color }} />{c.toLowerCase()}</span>)}<span className="legend-end">{clean ? "Connected points: push laps in the same stint" : "Hollow points: other laps"}</span></div>
    <div className="lap-ledger"><div className="ledger-heading"><h3>Lap register</h3><span>{laps.length} laps</span></div><div className="ledger-scroll"><table><thead><tr><th>Lap</th><th>Time</th><th>Tyre</th><th>Age</th><th>Speed</th><th>Status</th></tr></thead><tbody>{ordered.map(l => <tr className={l.lap_number === selectedLap ? "selected-row" : ""} key={l.lap_number}><td><button onClick={() => onSelect(l.lap_number)} aria-label={`Select lap ${l.lap_number}`}>{String(l.lap_number).padStart(2, "0")}</button></td><td>{format(l.lap_time_seconds)}</td><td><span style={{ color: colors[l.compound ?? ""] }}>{l.compound || "--"}</span></td><td>{l.tyre_life ?? "--"}</td><td>{l.top_speed ?? "--"}</td><td>{l.deleted ? "deleted" : l.classification?.replaceAll("_", " ")}</td></tr>)}</tbody></table></div></div>
  </section>;
}
