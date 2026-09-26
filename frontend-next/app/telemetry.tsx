"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import "./telemetry.css";
import "./telemetry-route-nav.css";
import "./telemetry-scale.css";
import { valueAt, signed, type Channel } from "./telemetry-values";
import { fastestLap, type TimedLap } from "./fastest-lap";
import { circuitAssetForRace } from "./circuit-assets";

type Sample = { distance: number; speed: number | null; throttle: number | null; brake: boolean | null; rpm: number | null; gear: number | null; drs: number | null; x?: number | null; y?: number | null };
type Lap = TimedLap & { compound: string };
type Entry = { driver: string; laps: Lap[]; lap: number; color: string; rows: Sample[]; trackLength: number; error: string; loading: boolean; visible: boolean };
type TrackPoint = { x: number; y: number; progress: number };
const palette = ["#ff5f74", "#52d9ff", "#f4c95d", "#bd8cff", "#64e2a4", "#ff9f5a", "#a8b7ff", "#f37fbc", "#b9e66b", "#ffdb6e"];
const channels = [["speed", "Speed", "km/h"], ["throttle", "Throttle", "%"], ["brake", "Brake", "ON / OFF"]] as const;
const time = (n: number | null | undefined) => n == null ? "--" : `${Math.floor(n / 60)}:${(n % 60).toFixed(3).padStart(6, "0")}`;

function normalizeTelemetry(rows: Sample[]) {
  const ordered = rows
    .filter((row) => Number.isFinite(row.distance))
    .sort((a, b) => a.distance - b.distance);
  if (ordered.length < 2) return { rows: [], trackLength: 0 };

  const start = ordered[0].distance;
  const trackLength = ordered[ordered.length - 1].distance - start;
  if (trackLength <= 0) return { rows: [], trackLength: 0 };

  // Every channel is evaluated against the same 0–1 lap progress scale.
  return {
    rows: ordered.map((row) => ({ ...row, distance: (row.distance - start) / trackLength })),
    trackLength,
  };
}

function median(values: number[]) {
  const ordered = values.filter((value) => value > 0).sort((a, b) => a - b);
  if (!ordered.length) return 0;
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function elapsedAt(rows: Sample[], distance: number, trackLength: number) {
  if (rows.length < 2 || distance < rows[0].distance) return null;
  let elapsed = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1]; const next = rows[index];
    const end = Math.min(distance, next.distance);
    const previousSpeed = previous.speed; const endSpeed = valueAt(rows, end, "speed");
    if (previousSpeed != null && endSpeed != null && end > previous.distance) {
      const averageSpeedMs = ((previousSpeed + endSpeed) / 2) / 3.6;
      if (averageSpeedMs > 0) elapsed += (end - previous.distance) * trackLength / averageSpeedMs;
    }
    if (distance <= next.distance) return elapsed;
  }
  return elapsed;
}

function DeltaTrace({ baseline, comparisons, left, right, cursor }: { baseline: Entry; comparisons: Entry[]; left: number; right: number; cursor: number }) {
  const series = useMemo(() => comparisons.map((entry) => ({ entry, points: Array.from({ length: 240 }, (_, index) => {
    const distance = left + (right - left) * index / 239;
    const referenceTime = elapsedAt(baseline.rows, distance, baseline.trackLength); const compareTime = elapsedAt(entry.rows, distance, entry.trackLength);
    return { distance, value: referenceTime == null || compareTime == null ? null : compareTime - referenceTime };
  }) })), [baseline.rows, baseline.trackLength, comparisons, left, right]);
  const extent = Math.max(0.05, ...series.flatMap((line) => line.points.map((point) => Math.abs(point.value || 0))));
  const x = (distance: number) => 64 + (distance - left) / Math.max(0.000001, right - left) * 770;
  const y = (value: number) => 56 - value / extent * 34;

  return <div className="delta-channel"><div className="trace-channel-head"><strong>Delta <small>seconds to {baseline.driver} / L{baseline.lap}</small></strong><div>{comparisons.map((entry) => <span key={entry.driver} style={{ color: entry.color }}>{entry.driver} / L{entry.lap}</span>)}</div></div><div className="channel-range"><span>Max</span><b>{signed(extent)}</b><span>Min</span><b>{signed(-extent)}</b></div><svg viewBox="0 0 900 112" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Cumulative lap time delta against the reference lap"><line x1={64} x2={834} y1={56} y2={56} stroke="#3a4650" strokeWidth={1}/>{[-1, 0, 1].map((value) => <text key={value} x={52} y={y(value * extent) + 4} textAnchor="end">{signed(value * extent)}</text>)}{series.map(({ entry, points }) => { let connected = false; const path = points.map((point) => { if (point.value == null) { connected = false; return ""; } const command = connected ? "L" : "M"; connected = true; return `${command}${x(point.distance)},${y(point.value)}`; }).join(" "); return <path key={entry.driver} d={path} fill="none" stroke={entry.color} strokeWidth={1.35} vectorEffect="non-scaling-stroke"/>; })}{cursor >= left && cursor <= right && <><line x1={x(cursor)} x2={x(cursor)} y1={18} y2={94} stroke="#d1e2d5" strokeDasharray="3 3"/>{series.map(({ entry }) => { const referenceTime = elapsedAt(baseline.rows, cursor, baseline.trackLength); const compareTime = elapsedAt(entry.rows, cursor, entry.trackLength); const value = referenceTime == null || compareTime == null ? null : compareTime - referenceTime; return value == null ? null : <circle key={entry.driver} cx={x(cursor)} cy={y(value)} r={3.5} fill="#0a0c10" stroke={entry.color} strokeWidth={1.75}/>; })}</>}</svg></div>;
}

function TelemetryTrackMap({ entries, layout, fallbackAsset, officialCircuitUrl, cursor, displayDistance, playing, playbackRate, onCursorChange, onPlayingChange, onPlaybackRateChange }: {
  entries: Entry[];
  layout: TrackPoint[];
  fallbackAsset: string | null;
  officialCircuitUrl: string | null;
  cursor: number;
  displayDistance: (progress: number) => number;
  playing: boolean;
  playbackRate: number;
  onCursorChange: (progress: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onPlaybackRateChange: (rate: number) => void;
}) {
  const fallbackPathRef = useRef<SVGPathElement>(null);
  const [fallbackPath, setFallbackPath] = useState("");
  const [fallbackMarker, setFallbackMarker] = useState<{ x: number; y: number } | null>(null);
  const reference = entries[0];
  const selectedLapCoordinates = reference?.rows.filter((row) => Number.isFinite(row.x) && Number.isFinite(row.y)) || [];
  const coordinateRows: Sample[] = layout.length > 10
    ? layout.map((point) => ({ distance: point.progress, speed: null, throttle: null, brake: null, rpm: null, gear: null, drs: null, x: point.x, y: point.y }))
    : selectedLapCoordinates;
  const hasTrackGeometry = coordinateRows.length > 10;
  const xValues = coordinateRows.map((row) => row.x as number);
  const yValues = coordinateRows.map((row) => row.y as number);
  const minX = xValues.length ? Math.min(...xValues) : 0;
  const maxX = xValues.length ? Math.max(...xValues) : 1;
  const minY = yValues.length ? Math.min(...yValues) : 0;
  const maxY = yValues.length ? Math.max(...yValues) : 1;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const scale = Math.min(264 / Math.max(1, maxX - minX), 224 / Math.max(1, maxY - minY));
  const pointFor = (row: Sample) => Number.isFinite(row.x) && Number.isFinite(row.y)
    ? { x: 160 + ((row.x as number) - centerX) * scale, y: 140 - ((row.y as number) - centerY) * scale }
    : null;
  const points = coordinateRows.map(pointFor).filter((point): point is { x: number; y: number } => point != null);
  const path = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const pointAt = (entry: Entry) => {
    const row = entry.rows.reduce<Sample | undefined>((closest, candidate) => !closest || Math.abs(candidate.distance - cursor) < Math.abs(closest.distance - cursor) ? candidate : closest, undefined);
    return row ? pointFor(row) : null;
  };

  useEffect(() => {
    if (!fallbackAsset) { setFallbackPath(""); return; }
    let active = true;
    fetch(fallbackAsset)
      .then((response) => response.ok ? response.text() : "")
      .then((svg) => {
        if (!active) return;
        const path = new DOMParser().parseFromString(svg, "image/svg+xml").querySelector("path");
        setFallbackPath(path?.getAttribute("d") || "");
      })
      .catch(() => { if (active) setFallbackPath(""); });
    return () => { active = false; };
  }, [fallbackAsset]);

  useEffect(() => {
    const path = fallbackPathRef.current;
    if (!path || !fallbackPath) { setFallbackMarker(null); return; }
    try {
      const point = path.getPointAtLength(path.getTotalLength() * cursor);
      setFallbackMarker({ x: point.x, y: point.y });
    } catch { setFallbackMarker(null); }
  }, [fallbackPath, cursor]);

  return <aside className="track-map-panel" aria-label="Synchronized track map">
    <div className="track-map-head"><div><strong>Track position</strong><small>{displayDistance(cursor)} m</small></div>{officialCircuitUrl ? <a href={officialCircuitUrl} target="_blank" rel="noreferrer">Official F1 layout</a> : <span>{reference ? `${reference.driver} / L${reference.lap}` : "Awaiting lap"}</span>}</div>
    {hasTrackGeometry ? <svg className="track-map" viewBox="0 0 320 280" role="img" aria-label="Circuit map with current telemetry position">
      <path d={path} fill="none" stroke="#2d3b45" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
      <path d={path} fill="none" stroke="#c6d2d7" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      {[1 / 6, 1 / 2, 5 / 6].map((progress, index) => {
        const row = coordinateRows.reduce<Sample>((closest, candidate) => Math.abs(candidate.distance - progress) < Math.abs(closest.distance - progress) ? candidate : closest, coordinateRows[0]);
        const point = pointFor(row);
        return point && <g key={index}><circle cx={point.x} cy={point.y} r="4" fill="#10151b" stroke="#66e7dc" strokeWidth="1.5" /><text x={point.x + 8} y={point.y - 8}>S{index + 1}</text></g>;
      })}
      {entries.map((entry, index) => {
        const point = pointAt(entry);
        return point && <g key={entry.driver} transform={`translate(${index * 4},${index * -4})`}><circle cx={point.x} cy={point.y} r="7" fill="#0d1117" stroke={entry.color} strokeWidth="2.5" /><circle cx={point.x} cy={point.y} r="2.5" fill={entry.color} /></g>;
      })}
    </svg> : fallbackAsset && fallbackPath ? <svg className="track-map track-map-fallback" viewBox="0 0 500 500" role="img" aria-label="Circuit layout with synchronized telemetry position">
      <path d={fallbackPath} fill="none" stroke="#27343e" strokeWidth="28" strokeLinecap="round" strokeLinejoin="round" />
      <path ref={fallbackPathRef} d={fallbackPath} fill="none" stroke="#dce8e7" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      {fallbackMarker && entries.map((entry, index) => <g key={entry.driver} transform={`translate(${index * 7},${index * -7})`}><circle cx={fallbackMarker.x} cy={fallbackMarker.y} r="13" fill="#0d1117" stroke={entry.color} strokeWidth="4" /><circle cx={fallbackMarker.x} cy={fallbackMarker.y} r="5" fill={entry.color} /></g>)}
      <text x="250" y="480" textAnchor="middle">{displayDistance(cursor)} m</text>
    </svg> : fallbackAsset ? <div className="track-map-fallback"><img src={fallbackAsset} alt="Circuit layout fallback" /><small>Loading circuit layout</small></div> : <div className="track-map-unavailable">Track position data is unavailable for this session.</div>}
    <div className="track-map-controls"><button type="button" className="map-play" onClick={() => onPlayingChange(!playing)} title={playing ? "Pause cursor playback" : "Play cursor playback"}>{playing ? "||" : ">"}</button><input aria-label="Telemetry playback position" type="range" min="0" max="1000" value={Math.round(cursor * 1000)} onChange={(event) => onCursorChange(Number(event.target.value) / 1000)} /><select aria-label="Playback speed" value={playbackRate} onChange={(event) => onPlaybackRateChange(Number(event.target.value))}><option value="0.5">0.5x</option><option value="1">1x</option><option value="2">2x</option><option value="4">4x</option></select></div>
  </aside>;
}

export default function Telemetry({ api, year, race, session, drivers, lap, onRemoveDriver }: { api: string; year: string; race: string; session: string; drivers: string[]; lap?: number; onRemoveDriver?: (driver: string) => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [trackLayout, setTrackLayout] = useState<TrackPoint[]>([]);
  const [officialCircuitUrl, setOfficialCircuitUrl] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [difference, setDifference] = useState(false);
  const [activeSector, setActiveSector] = useState<string>("all");
  const [lapPickerOpen, setLapPickerOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [hover, setHover] = useState<{ key: string; title: string; unit: string; x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState<[number, number]>([0, 1]);
  const [drag, setDrag] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [message, setMessage] = useState("");
  const generation = useRef(0);
  const versions = useRef<Record<string, number>>({});
  const driverKey = drivers.join(",");
  const activeEntries = entries.filter(e => e.visible && e.rows.length);
  const baseline = activeEntries.find(e => e.driver === reference) || activeEntries[0];
  const distance = 1;
  const trackLength = median(activeEntries.map((entry) => entry.trackLength));
  const fallbackAsset = circuitAssetForRace(race);
  const displayDistance = (progress: number) => Math.round(progress * trackLength);
  const times = entries.map(e => e.laps.find(l => l.lap_number === e.lap)?.lap_time_seconds).filter((n): n is number => n != null);
  const best = times.length ? Math.min(...times) : 0;
  const cursorSpeed = baseline ? valueAt(baseline.rows, cursor, "speed") : null;
  const comparison = activeEntries.find((entry) => entry !== baseline);
  const cursorDelta = baseline && comparison
    ? (() => {
      const referenceTime = elapsedAt(baseline.rows, cursor, baseline.trackLength);
      const comparisonTime = elapsedAt(comparison.rows, cursor, comparison.trackLength);
      return referenceTime == null || comparisonTime == null ? null : comparisonTime - referenceTime;
    })()
    : null;

  async function get(path: string, signal?: AbortSignal) {
    const response = await fetch(`${api}${path}`, { signal });
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Telemetry request failed");
    return data;
  }
  async function fetchLap(driver: string, number: number, version: number, signal?: AbortSignal) {
    const request = (versions.current[driver] || 0) + 1;
    versions.current[driver] = request;
    setEntries(old => old.map(e => e.driver === driver ? { ...e, lap: number, rows: [], trackLength: 0, loading: true, error: "" } : e));
    try {
      const query = new URLSearchParams({ year, race, session, driver, lap: String(number), telemetry_samples: "1000" });
      const result = await get(`/lap-telemetry?${query}`, signal);
      if (generation.current !== version || versions.current[driver] !== request || signal?.aborted) return;
      const normalized = normalizeTelemetry(result.telemetry);
      setEntries(old => old.map(e => e.driver === driver ? { ...e, rows: normalized.rows, trackLength: normalized.trackLength, loading: false, error: normalized.rows.length ? "" : "No telemetry for this lap." } : e));
    } catch (error) {
      if (generation.current !== version || versions.current[driver] !== request || signal?.aborted) return;
      setEntries(old => old.map(e => e.driver === driver ? { ...e, loading: false, error: error instanceof Error ? error.message : "Telemetry unavailable" } : e));
    }
  }
  const contextKey = `${api}|${year}|${race}|${session}`;
  const previousContext = useRef("");
  const previousCodes = useRef<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    setTrackLayout([]);
    setOfficialCircuitUrl(null);
    const query = new URLSearchParams({ year, race, session });
    fetch(`${api}/track-layout?${query}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (!controller.signal.aborted) { setTrackLayout(Array.isArray(data?.points) ? data.points : []); setOfficialCircuitUrl(typeof data?.official_circuit_url === "string" ? data.official_circuit_url : null); } })
      .catch(() => { if (!controller.signal.aborted) { setTrackLayout([]); setOfficialCircuitUrl(null); } });
    return () => controller.abort();
  }, [api, year, race, session]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setCursor((position) => position >= 1 ? 0 : Math.min(1, position + 0.0025 * playbackRate)), 40);
    return () => window.clearInterval(timer);
  }, [playing, playbackRate]);

  useEffect(() => {
    const controller = new AbortController();
    const version = ++generation.current;
    const codes = driverKey.split(",").filter(Boolean);
    // A session/context switch invalidates every driver's data; adding or removing
    // a driver within the same session only needs to touch the drivers that changed.
    const contextChanged = previousContext.current !== contextKey;
    const saved = new URLSearchParams(window.location.search);

    if (contextChanged) {
      setZoom([0, 1]); setCursor(0); setDrag(null); setHover(null); setActiveSector("all");
      setEntries(codes.map((driver, index) => ({ driver, laps: [], lap: 0, color: palette[index % palette.length], rows: [], trackLength: 0, loading: true, error: "", visible: true })));
    } else {
      const previousDriverSet = new Set(previousCodes.current);
      setEntries(old => {
        const kept = old.filter(e => codes.includes(e.driver));
        const added = codes.filter(driver => !previousDriverSet.has(driver)).map((driver, i) => ({ driver, laps: [], lap: 0, color: palette[(kept.length + i) % palette.length], rows: [], trackLength: 0, loading: true, error: "", visible: true }));
        return [...kept, ...added];
      });
    }

    const newCodes = contextChanged ? codes : codes.filter(driver => !previousCodes.current.includes(driver));
    previousContext.current = contextKey;
    previousCodes.current = codes;

    newCodes.forEach(async (driver) => {
      const index = codes.indexOf(driver);
      try {
        const result = await get(`/driver-analysis?${new URLSearchParams({ year, race, session, driver })}`, controller.signal);
        if (controller.signal.aborted || generation.current !== version) return;
        const laps: Lap[] = result.laps.filter((l: Lap) => l.lap_time_seconds != null);
        const requested = Number(saved.get(`lap_${driver}`)) || (contextChanged && index === 0 ? lap : undefined);
        const selected = laps.find(l => l.lap_number === requested) || fastestLap(laps);
        setEntries(old => old.map(e => e.driver === driver ? { ...e, laps, lap: selected?.lap_number || 0, loading: !!selected, error: selected ? "" : "No timed laps." } : e));
        if (selected) await fetchLap(driver, selected.lap_number, version, controller.signal);
      } catch (error) {
        if (!controller.signal.aborted && generation.current === version) setEntries(old => old.map(e => e.driver === driver ? { ...e, loading: false, error: error instanceof Error ? error.message : "Session unavailable" } : e));
      }
    });
    return () => { controller.abort(); generation.current++; };
  }, [api, year, race, session, driverKey]);

  const left = zoom[0] * distance, right = zoom[1] * distance;
  const x = (d: number) => 64 + (d - left) / Math.max(0.000001, right - left) * 770;
  const nearest = (rows: Sample[]) => rows.reduce<Sample | undefined>((best, r) => !best || Math.abs(r.distance - cursor) < Math.abs(best.distance - cursor) ? r : best, undefined);
  function pointer(event: React.PointerEvent<SVGSVGElement>) {
    const svg = event.currentTarget;
    const p = svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY;
    const matrix = svg.getScreenCTM();
    const px = matrix ? p.matrixTransform(matrix.inverse()).x : 64;
    return left + Math.max(0, Math.min(1, (px - 64) / 770)) * (right - left);
  }
  function selectFastest() {
    setZoom([0, 1]); setHover(null); setDrag(null); setActiveSector("all");
    const missing = entries.filter(e => !fastestLap(e.laps)).map(e => e.driver);
    setMessage(missing.length ? `No valid fastest lap for ${missing.join(", ")}.` : "Comparing each selected driver's fastest valid lap.");
    entries.forEach(e => {
      const bestLap = fastestLap(e.laps);
      if (bestLap) {
        setEntries(old => old.map(v => v.driver === e.driver ? { ...v, visible: true } : v));
        void fetchLap(e.driver, bestLap.lap_number, generation.current);
      }
    });
  }
  async function share() {
    const url = new URL(window.location.href);
    entries.forEach(e => url.searchParams.set(`lap_${e.driver}`, String(e.lap)));
    try { await navigator.clipboard.writeText(url.toString()); setMessage("Comparison link copied"); }
    catch { setMessage("Clipboard unavailable"); }
  }
  function focusSector(index: number) {
    setActiveSector(`S${index + 1}`);
    setZoom([index / 3, (index + 1) / 3]);
    setCursor((index + 0.5) / 3 * distance);
    setHover(null);
  }
  function exportTelemetry() {
    const lines = ["driver,lap,distance_m,speed_kmh,throttle_pct,brake"];
    activeEntries.forEach((entry) => entry.rows.forEach((row) => lines.push([entry.driver, entry.lap, (row.distance * entry.trackLength).toFixed(2), row.speed ?? "", row.throttle ?? "", row.brake ? "on" : "off"].join(","))));
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url; link.download = `tempo-lab-${year}-${race.replaceAll(" ", "-").toLowerCase()}-${session}-telemetry.csv`;
    link.click(); URL.revokeObjectURL(url);
    setMessage("Telemetry CSV exported");
  }
  const workspaceQuery = new URLSearchParams({ year, race, session, drivers: drivers.join(",") });
  const workspaceHref = (tab: string) => `/?${new URLSearchParams({ ...Object.fromEntries(workspaceQuery), tab }).toString()}`;

  return <section className="telemetry-workspace">
    <header className="telemetry-console">
      <div className="telemetry-console-brand"><span className="mark">TL</span><div><strong>Tempo Lab</strong><small>F1 telemetry comparison</small></div></div>
      <div className="telemetry-lap-chips">{entries.filter((entry) => entry.visible).map((entry) => <div key={entry.driver} className="telemetry-lap-chip"><button type="button" className="telemetry-lap-chip-select" onClick={() => setReference(entry.driver)} title={`Use ${entry.driver} as the reference lap`}><i style={{ background: entry.color }}></i><b>{entry.driver}</b><span>L{entry.lap || "--"}</span></button>{onRemoveDriver && <button type="button" className="telemetry-lap-chip-remove" title={`Remove ${entry.driver} from comparison`} aria-label={`Remove ${entry.driver} from comparison`} onClick={() => onRemoveDriver(entry.driver)}>×</button>}</div>)}<button type="button" className="telemetry-add-lap" onClick={() => setLapPickerOpen((open) => !open)}>+ Add lap</button></div>
      <div className="telemetry-cursor-readout"><span>Cursor</span><div><b>Dist</b> {displayDistance(cursor)} m</div><div><b>Speed</b> {cursorSpeed == null ? "--" : `${Math.round(cursorSpeed)} km/h`}</div>{cursorDelta != null && <div><b>Delta</b> <em>{signed(cursorDelta)} s</em></div>}</div>
      <div className="telemetry-console-actions"><button type="button" onClick={share}>Share</button><button type="button" onClick={exportTelemetry}>Export</button></div>
    </header>
    <nav className="telemetry-route-nav" aria-label="Analysis pages"><a href={workspaceHref("session")}>Session</a><a href={workspaceHref("laps")}>Driver laps</a><a href={workspaceHref("longruns")}>Long runs</a><a className="active" href={workspaceHref("telemetry")}>Telemetry</a></nav>
    {lapPickerOpen && <section className="telemetry-popover lap-picker" aria-label="Select comparison laps"><header><strong>Comparison laps</strong><button type="button" onClick={() => setLapPickerOpen(false)}>Close</button></header>{entries.map((entry) => <label key={entry.driver}><span style={{ color: entry.color }}>{entry.driver}</span><select value={entry.lap} disabled={!entry.laps.length || entry.loading} onChange={(event) => void fetchLap(entry.driver, Number(event.target.value), generation.current)}>{entry.laps.map((entryLap) => <option key={entryLap.lap_number} value={entryLap.lap_number}>L{entryLap.lap_number} · {time(entryLap.lap_time_seconds)} · {entryLap.compound}</option>)}</select></label>)}</section>}
    {!!message && <p className="telemetry-action-status" role="status">{message}</p>}
    <footer className="telemetry-footer telemetry-context"><span><i></i>Data link <b>Live</b></span><span>Track <b>{race}</b></span><span>Session <b>{session}</b></span><span>Year <b>{year}</b></span><span>Reference <b>{baseline ? `${baseline.driver} / L${baseline.lap}` : "--"}</b></span></footer>
    {hover && <div className="pointer-telemetry" role="tooltip" style={{ left: hover.x, top: hover.y }}><div><strong>{hover.title}</strong><span>{displayDistance(cursor)} m</span></div><small>Difference vs {baseline?.driver} / L{baseline?.lap}</small>{activeEntries.map(e => {
      const key = hover.key as Channel;
      const v = valueAt(e.rows, cursor, key);
      const b = baseline ? valueAt(baseline.rows, cursor, key) : null;
      return <p key={e.driver}><span style={{ color: e.color }}>{e.driver} / L{e.lap}</span><b>{v == null ? "--" : key === "brake" ? v ? "On" : "Off" : v.toFixed(1)} <small>{hover.unit}</small><em>{e.driver === baseline?.driver ? "Reference" : v == null || b == null ? "No overlap" : key === "brake" || key === "drs" ? v === b ? "Same state" : "Different state" : `${signed(v-b)} ${key === "throttle" ? "pp" : hover.unit}`}</em></b></p>;
    })}</div>}
    {!entries.length && <p className="chart-empty">Select drivers to compare laps.</p>}
    <div className="trace-cards">{entries.map(e => {
      const selected = e.laps.find(l => l.lap_number === e.lap);
      const fastest = fastestLap(e.laps);
      return <article key={e.driver} className="trace-card" style={{ borderTopColor: e.color }}>
        <div className="trace-title"><strong>{e.driver}</strong><input type="color" aria-label={`${e.driver} trace color`} value={e.color} onChange={event => setEntries(old => old.map(v => v.driver === e.driver ? { ...v, color: event.target.value } : v))}/><label><input type="checkbox" checked={e.visible} onChange={event => setEntries(old => old.map(v => v.driver === e.driver ? { ...v, visible: event.target.checked } : v))}/>Visible</label></div>
        <select aria-label={`${e.driver} lap`} value={e.lap} disabled={!e.laps.length} onChange={event => fetchLap(e.driver, Number(event.target.value), generation.current)}>
          {!e.laps.length && <option value={0}>No laps</option>}{e.laps.map(l => <option key={l.lap_number} value={l.lap_number}>Lap {l.lap_number} / {time(l.lap_time_seconds)} / {l.compound}</option>)}
        </select><div className="trace-time"><b>{time(selected?.lap_time_seconds)}</b><span>{selected?.lap_time_seconds != null ? `+${(selected.lap_time_seconds - best).toFixed(3)}s` : "--"}</span></div>
        <button className="fastest-driver" disabled={e.loading || !fastest} title="Fastest non-deleted lap, excluding pit-in and pit-out laps" onClick={() => { if (fastest) void fetchLap(e.driver, fastest.lap_number, generation.current); }}>{fastest?.lap_number === e.lap ? "Fastest lap selected" : "Use fastest lap"}{fastest ? ` / L${fastest.lap_number}` : ""}</button>
        {e.loading && <small role="status">Loading trace...</small>}{e.error && <small role="alert">{e.error}</small>}
      </article>;
    })}</div>
    {!!entries.length && <div className="trace-toolbar"><button className="fastest-all" disabled={!entries.length || entries.some(e => e.loading) || !entries.some(e => fastestLap(e.laps))} onClick={selectFastest}>Compare fastest laps</button><span>{displayDistance(cursor)} m</span><span>{displayDistance(left)} - {displayDistance(right)} m</span><button onClick={share}>Share comparison</button><small role="status">{message}</small></div>}
    {activeEntries.length > 0 && <div className="difference-controls"><label>Reference <select value={baseline?.driver || ""} onChange={e => setReference(e.target.value)}>{activeEntries.map(e => <option key={e.driver} value={e.driver}>{e.driver} / L{e.lap}</option>)}</select></label><div className="segmented"><button aria-pressed={!difference} onClick={() => setDifference(false)}>Overlay</button><button disabled={activeEntries.length < 2} aria-pressed={difference} onClick={() => setDifference(true)}>Difference</button></div><span>{difference ? `Driver minus ${baseline?.driver}; positive means higher, not necessarily faster.` : "Overlay: values · Difference: signed vs reference"}</span><div className="sector-controls"><small>Sectors</small>{["S1", "S2", "S3"].map((sector, index) => <button key={sector} type="button" className={activeSector === sector ? "active" : ""} onClick={() => focusSector(index)}>{sector}</button>)}</div></div>}
    {activeEntries.length > 0 && <div className="telemetry-analysis-grid"><TelemetryTrackMap entries={activeEntries} layout={trackLayout} fallbackAsset={fallbackAsset} officialCircuitUrl={officialCircuitUrl} cursor={cursor} displayDistance={displayDistance} playing={playing} playbackRate={playbackRate} onCursorChange={setCursor} onPlayingChange={setPlaying} onPlaybackRateChange={setPlaybackRate} />{channels.map(([key, title, unit]) => {
      const deltaMode = difference && activeEntries.length > 1;
      const chartEntries = deltaMode ? activeEntries.filter(e => e !== baseline) : activeEntries;
      const plotValue = (e: Entry, d: number) => {
        const v = valueAt(e.rows, d, key);
        const b = baseline ? valueAt(baseline.rows, d, key) : null;
        return deltaMode ? v == null || b == null ? null : v - b : v;
      };
      const grid = Array.from({ length: 1001 }, (_, i) => left + (right-left)*i/1000);
      const visibleValues = chartEntries.flatMap((entry) => grid.map((point) => plotValue(entry, point)).filter((value): value is number => value != null && Number.isFinite(value)));
      const visibleMinimum = visibleValues.length ? Math.min(...visibleValues) : 0;
      const visiblePeak = visibleValues.length ? Math.max(...visibleValues) : 1;
      const extent = Math.max(1, ...chartEntries.flatMap(e => grid.map(d => Math.abs(plotValue(e,d) || 0))));
      const padding = Math.max(3, (visiblePeak - visibleMinimum) * 0.08);
      const domainMinimum = deltaMode ? -extent : key === "throttle" || key === "brake" ? 0 : Math.max(0, Math.floor((visibleMinimum - padding) / 10) * 10);
      const domainMaximum = deltaMode ? extent : key === "throttle" || key === "brake" ? key === "throttle" ? 100 : 1 : Math.ceil((visiblePeak + padding) / 10) * 10;
      const domainRange = Math.max(1, domainMaximum - domainMinimum);
      const y = (value: number) => 142 - (value - domainMinimum) / domainRange * 120;
      const axisTicks = key === "brake" && !deltaMode ? [0, 1] : Array.from({ length: 5 }, (_, index) => domainMinimum + domainRange * index / 4);
      const clipId = `telemetry-plot-${key}`;
      const sectorBoundaries = [1 / 3, 2 / 3].filter((point) => point > left && point < right);
      const sectorLabels = [[1 / 6, "S1"], [1 / 2, "S2"], [5 / 6, "S3"]].filter(([point]) => Number(point) >= left && Number(point) <= right) as [number, string][];
      const zoomed = left > 0 || right < distance;
      return <Fragment key={key}><div className={`trace-channel trace-${key}`}><div className="trace-channel-head"><strong>{title}{deltaMode ? " difference" : ""} <small>{key === "throttle" && deltaMode ? "pp" : unit}</small></strong><div>{activeEntries.map(e => <span key={e.driver} style={{ color: e.color }}>{e.driver} / L{e.lap}</span>)}</div></div><div className="channel-range"><span>Max</span><b>{key === "brake" && !deltaMode ? "On" : Math.round(domainMaximum)}</b><span>Min</span><b>{key === "brake" && !deltaMode ? "Off" : Math.round(domainMinimum)}</b></div>
        {key === "speed" && <button type="button" className={`zoom-hint${zoomed ? " active" : ""}`} disabled={!zoomed} onClick={() => { setZoom([0, 1]); setDrag(null); setActiveSector("all"); }}>{zoomed ? "⟲ Reset zoom" : "🔍 Click and drag to zoom"}</button>}
        <svg viewBox="0 0 900 200" preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${title} comparison against distance; drag to zoom`} style={{ touchAction: "pan-y" }} onPointerLeave={() => { if (drag == null) setHover(null); }} onPointerMove={event => { setCursor(pointer(event)); setHover({ key, title, unit, x: Math.max(8, Math.min(event.clientX + 18, window.innerWidth - 246)), y: Math.max(8, Math.min(event.clientY + 18, window.innerHeight - (125 + activeEntries.length * 52))) }); }} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); const d = pointer(event); setDrag(d); setCursor(d); }} onPointerCancel={() => setDrag(null)} onPointerUp={event => { const d = pointer(event); if (drag != null && Math.abs(d-drag) > distance * .01) setZoom([Math.min(d,drag)/distance, Math.max(d,drag)/distance]); setDrag(null); }}>
          <defs><clipPath id={clipId}><rect x="64" y="22" width="770" height="120" /></clipPath></defs>
          <line x1={64} x2={64} y1={22} y2={142} stroke="#59636e" />
          <line x1={64} x2={834} y1={142} y2={142} stroke="#59636e" />
          {axisTicks.map((number) => <g key={number}><line x1={64} x2={834} y1={y(number)} y2={y(number)} stroke={deltaMode && Math.abs(number) < .001 ? "#4a5c53" : "#27313a"} strokeDasharray={deltaMode && Math.abs(number) < .001 ? undefined : "3 5"}/><text x={52} y={y(number) + 4} textAnchor="end">{deltaMode ? signed(number) : Math.round(number)}</text></g>)}
          {key === "speed" && <>{sectorBoundaries.map((point) => <line key={point} x1={x(point)} x2={x(point)} y1={22} y2={142} stroke="#3a4650" strokeWidth={1}/>)}{sectorLabels.map(([point, label]) => <text key={label} x={x(point)} y={17} textAnchor="middle">{label}</text>)}</>}
          {[0,.25,.5,.75,1].map(v => <text key={v} x={64+v*770} y={164} textAnchor="middle">{displayDistance(left + v * (right - left))} m</text>)}
          <text x={449} y={190} textAnchor="middle">Distance (m)</text>
          <g clipPath={`url(#${clipId})`}>{chartEntries.map(e => {
            let connected = false;
            const path = grid.map(d => { const v = plotValue(e,d); if (v == null) { connected = false; return ""; } const command = connected ? (key === "brake" ? `H${x(d)}V` : `L${x(d)},`) : `M${x(d)},`; connected = true; return `${command}${y(v)}`; }).join(" ");
            return <path key={e.driver} d={path} fill="none" stroke={e.color} strokeWidth={1.3} vectorEffect="non-scaling-stroke"/>;
          })}</g>
          {cursor >= left && cursor <= right && <><line x1={x(cursor)} x2={x(cursor)} y1={22} y2={142} stroke="#d1e2d5" strokeWidth={1.25} strokeDasharray="3 3"/>{chartEntries.map((entry) => { const value = plotValue(entry, cursor); return value == null ? null : <circle key={entry.driver} cx={x(cursor)} cy={y(value)} r={3.5} fill="#0a0c10" stroke={entry.color} strokeWidth={1.75} />; })}</>}
          {drag != null && <rect x={Math.min(x(drag),x(cursor))} y={22} width={Math.abs(x(drag)-x(cursor))} height={120} fill="#bbdf93" opacity={.12}/>}
        </svg>
      </div>{key === "speed" && baseline && activeEntries.length > 1 && <DeltaTrace baseline={baseline} comparisons={activeEntries.filter((entry) => entry !== baseline)} left={left} right={right} cursor={cursor} />}</Fragment>;
    })}</div>}
  </section>;
}
