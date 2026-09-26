"use client";

import { useEffect, useMemo, useState } from "react";
import "./long-run-controls.css";
import "./stint-chart.css";

type LongRunLap = { lap_number: number; lap_time_seconds: number; tyre_life: number | null; default_included: boolean; exclusion_reason: string | null };
type LongRun = { run_id: string; driver: string; stint: number; compound: string; laps: LongRunLap[] };
export type LongRunData = { runs: LongRun[]; min_laps: number } | null;

const RUN_COLORS = ["#42ddd1", "#FF8000", "#E8002D", "#3671C6", "#00D2BE", "#B6BABD", "#229971", "#FF87BC"];

function time(value: number | null | undefined) { return value == null || !Number.isFinite(value) ? "-" : `${Math.floor(value / 60)}:${(value % 60).toFixed(3).padStart(6, "0")}`; }
function average(laps: LongRunLap[]) { return laps.length ? laps.reduce((sum, lap) => sum + lap.lap_time_seconds, 0) / laps.length : null; }
function degradation(laps: LongRunLap[]) {
  if (laps.length < 3) return null;
  const meanX = (laps.length - 1) / 2; const meanY = average(laps) || 0;
  const numerator = laps.reduce((sum, lap, index) => sum + (index - meanX) * (lap.lap_time_seconds - meanY), 0);
  const denominator = laps.reduce((sum, _, index) => sum + (index - meanX) ** 2, 0);
  return denominator ? numerator / denominator : null;
}

const CHART = { left: 70, right: 1000, top: 20, bottom: 310, axisY: 332, captionY: 356 };

export default function LongRunAnalysis({ data }: { data: LongRunData }) {
  const [selectedByRun, setSelectedByRun] = useState<Record<string, number[]>>({});
  const [visibleTyres, setVisibleTyres] = useState<string[]>([]);
  const [removedRunIds, setRemovedRunIds] = useState<string[]>([]);
  const [xMode, setXMode] = useState<"tyre" | "lap">("tyre");
  useEffect(() => { setSelectedByRun(Object.fromEntries((data?.runs || []).map((run) => [run.run_id, run.laps.filter((lap) => lap.default_included).map((lap) => lap.lap_number)]))); setVisibleTyres([]); setRemovedRunIds([]); }, [data]);
  const compounds = useMemo(() => Array.from(new Set((data?.runs || []).map((run) => run.compound))).sort(), [data]);
  const colorByRunId = useMemo(() => Object.fromEntries((data?.runs || []).map((run, index) => [run.run_id, RUN_COLORS[index % RUN_COLORS.length]])), [data]);
  const calculated = useMemo(() => (data?.runs || []).map((run) => { const included = run.laps.filter((lap) => (selectedByRun[run.run_id] || []).includes(lap.lap_number)); return { ...run, included, averagePace: average(included), dropoff: degradation(included) }; }), [data, selectedByRun]);
  const groups = useMemo(() => compounds.filter((compound) => !visibleTyres.length || visibleTyres.includes(compound)).map((compound) => { const compoundRuns = calculated.filter((run) => run.compound === compound); const runs = compoundRuns.filter((run) => !removedRunIds.includes(run.run_id)).sort((a, b) => (a.averagePace ?? Infinity) - (b.averagePace ?? Infinity)); return { compound, runs, hiddenCount: compoundRuns.length - runs.length, best: runs.find((run) => run.averagePace != null)?.averagePace || null, maxLaps: Math.max(0, ...runs.map((run) => run.laps.length)) }; }), [calculated, compounds, removedRunIds, visibleTyres]);
  const tyreOrder = useMemo(() => groups.filter((group) => group.best != null).sort((a, b) => (a.best || 0) - (b.best || 0)), [groups]);
  const chartRuns = useMemo(() => groups.flatMap((group) => group.runs), [groups]);
  const toggleLap = (runId: string, lapNumber: number) => setSelectedByRun((current) => { const selected = current[runId] || []; return { ...current, [runId]: selected.includes(lapNumber) ? selected.filter((lap) => lap !== lapNumber) : [...selected, lapNumber] }; });
  const resetRun = (run: LongRun) => setSelectedByRun((current) => ({ ...current, [run.run_id]: run.laps.filter((lap) => lap.default_included).map((lap) => lap.lap_number) }));
  const restoreCompound = (compound: string) => setRemovedRunIds((current) => current.filter((runId) => !calculated.some((run) => run.compound === compound && run.run_id === runId)));

  const xValue = (lap: LongRunLap) => xMode === "tyre" ? (lap.tyre_life ?? 0) : lap.lap_number;
  const chartLaps = useMemo(() => chartRuns.flatMap((run) => run.laps.filter((lap) => Number.isFinite(lap.lap_time_seconds)).map((lap) => ({ run, lap }))), [chartRuns, xMode]);
  const xs = chartLaps.map(({ lap }) => xValue(lap));
  const ys = chartLaps.map(({ lap }) => lap.lap_time_seconds);
  const minX = xs.length ? Math.min(...xs) : 0; const maxX = xs.length ? Math.max(...xs, minX + 1) : 1;
  const minY = ys.length ? Math.min(...ys) : 0; const maxY = ys.length ? Math.max(...ys) : 1;
  const padY = Math.max((maxY - minY) * 0.15, 0.25);
  const plotX = (v: number) => CHART.left + (v - minX) / Math.max(1, maxX - minX) * (CHART.right - CHART.left);
  const plotY = (v: number) => CHART.top + (maxY + padY - v) / Math.max(0.001, maxY - minY + 2 * padY) * (CHART.bottom - CHART.top);
  const yTicks = Array.from({ length: 5 }, (_, i) => minY - padY + (maxY - minY + 2 * padY) * i / 4);
  const xTickCount = Math.min(8, Math.max(2, Math.round(maxX - minX) + 1));
  const xTicks = Array.from(new Set(Array.from({ length: xTickCount }, (_, i) => Math.round(minX + (maxX - minX) * i / (xTickCount - 1)))));
  const runPaths = useMemo(() => chartRuns.map((run) => {
    const points = run.laps.filter((lap) => Number.isFinite(lap.lap_time_seconds)).slice().sort((a, b) => xValue(a) - xValue(b));
    const path = points.map((lap, index) => `${index === 0 ? "M" : "L"}${plotX(xValue(lap)).toFixed(1)},${plotY(lap.lap_time_seconds).toFixed(1)}`).join(" ");
    return { run, path, points };
  }), [chartRuns, xMode, minX, maxX, minY, maxY]);

  if (!data) return <p className="chart-empty">Loading long-run comparison...</p>;
  if (!data.runs.length) return <p className="chart-empty">No runs with at least {data.min_laps} representative laps are available for these drivers.</p>;
  return <div className="long-run-analysis longrun-workspace">
    <section className="tyre-order"><div><span className="kicker">Session tyre order</span><h3>Best observed long-run pace</h3></div><div className="tyre-order-list">{tyreOrder.map((group, index) => <div key={group.compound}><b>{index + 1}</b><span className={`tyre ${group.compound.toLowerCase()}`}>{group.compound}</span><strong>{time(group.best)}</strong><small>{index ? `+${((group.best || 0) - (tyreOrder[0].best || 0)).toFixed(3)}s` : "Session best"}</small></div>)}</div></section>
    <section className="longrun-view-controls">
      <span className="kicker">View mode</span>
      <div className="segmented" aria-label="Chart x-axis"><button type="button" aria-pressed={xMode === "tyre"} onClick={() => setXMode("tyre")}>Tyre life</button><button type="button" aria-pressed={xMode === "lap"} onClick={() => setXMode("lap")}>Lap number</button></div>
      <div className="longrun-filter">{compounds.map((compound) => <button type="button" key={compound} aria-pressed={!visibleTyres.length || visibleTyres.includes(compound)} onClick={() => setVisibleTyres((current) => current.includes(compound) ? current.filter((value) => value !== compound) : [...current, compound])}>{compound}</button>)}<button type="button" className="filter-reset" onClick={() => setVisibleTyres([])}>All tyres</button></div>
    </section>

    <section className="stint-chart-card">
      <div className="stint-chart-head"><span>Lap time / m:ss vs {xMode === "tyre" ? "tyre life" : "lap number"}</span><span>Solid points count toward the average</span></div>
      {!chartLaps.length ? <p className="chart-empty">No laps to plot for the current filters.</p> : <div className="stint-chart-plot">
        <svg viewBox="0 0 1040 380" role="img" aria-label="Long-run stint overlay chart">
          {yTicks.map((t) => <g key={t}><line x1={CHART.left} x2={CHART.right} y1={plotY(t)} y2={plotY(t)} stroke="#29302f" strokeDasharray="3 5" /><text x={CHART.left - 12} y={plotY(t) + 4} textAnchor="end">{time(t)}</text></g>)}
          {xTicks.map((t) => <text key={t} x={plotX(t)} y={CHART.axisY} textAnchor="middle">{xMode === "tyre" ? `L${t}` : t}</text>)}
          <text x={(CHART.left + CHART.right) / 2} y={CHART.captionY} textAnchor="middle">{xMode === "tyre" ? "TYRE LIFE (LAPS ON THIS SET)" : "LAP NUMBER"}</text>
          {runPaths.map(({ run, path }) => <path key={run.run_id} d={path} fill="none" stroke={colorByRunId[run.run_id]} strokeWidth={2.25} vectorEffect="non-scaling-stroke" />)}
          {runPaths.map(({ run, points }) => <g key={run.run_id}>{points.map((lap) => { const included = run.included.some((l) => l.lap_number === lap.lap_number); return <circle key={lap.lap_number} cx={plotX(xValue(lap))} cy={plotY(lap.lap_time_seconds)} r={included ? 4 : 3.5} fill={included ? colorByRunId[run.run_id] : "#0a0c10"} stroke={colorByRunId[run.run_id]} strokeWidth={2} />; })}</g>)}
        </svg>
      </div>}
      <div className="stint-chart-legend">{chartRuns.map((run) => <span key={run.run_id}><i style={{ background: colorByRunId[run.run_id] }} />{run.driver} · {run.compound}</span>)}<span className="legend-end">Hollow point = excluded lap</span></div>
    </section>

    <div className="longrun-content-grid"><div className="longrun-tables">
    {groups.map((group) => <div className="compound-run-group" key={group.compound}>
        <header><div className="compound-run-heading"><span className={`tyre ${group.compound.toLowerCase()}`}>{group.compound}</span><h3>{group.compound} long runs</h3><span className="stint-group-count">{group.runs.length} &middot; best {time(group.best)}</span></div><div className="longrun-group-actions"><small>{group.runs.length} representative {group.runs.length === 1 ? "run" : "runs"}</small>{group.hiddenCount > 0 && <button type="button" onClick={() => restoreCompound(group.compound)}>Restore {group.hiddenCount}</button>}</div></header>
        <div className="stint-run-list">
          {group.runs.map((run, index) => { const first = run.laps[0]?.lap_number; const last = run.laps.at(-1)?.lap_number; return <div className="stint-run-row" key={run.run_id}>
            <div className="stint-run-id"><span className="stint-run-rank" style={{ background: index === 0 ? colorByRunId[run.run_id] : undefined, color: index === 0 ? "#071210" : undefined }}>{run.averagePace == null ? "-" : index + 1}</span><span className="stint-run-bar" style={{ background: colorByRunId[run.run_id] }}></span><div><strong>{run.driver}</strong><small>Stint {run.stint} &middot; {first && last ? `L${first}-L${last}` : "--"}</small></div></div>
            <div className="stint-run-chips">{run.laps.map((lap) => { const included = run.included.some((value) => value.lap_number === lap.lap_number); return <button type="button" key={lap.lap_number} className={`lap-toggle ${included ? "included" : "excluded"}`} onClick={() => toggleLap(run.run_id, lap.lap_number)} title={lap.exclusion_reason || "Included in average"}><b>L{lap.lap_number}</b><span>{time(lap.lap_time_seconds)}</span></button>; })}</div>
            <div className="stint-run-stats">
              <div><span>Average</span><b className="pace-value">{time(run.averagePace)}</b></div>
              <div><span>Gap</span><b>{run.averagePace == null ? "-" : index ? `+${((run.averagePace || 0) - (group.best || 0)).toFixed(3)}s` : "Best"}</b></div>
              <div><span>Per lap</span><b className={run.dropoff != null && run.dropoff < 0 ? "gain" : undefined}>{run.dropoff == null ? "-" : `${run.dropoff >= 0 ? "+" : ""}${run.dropoff.toFixed(3)}s`}</b></div>
              <div><span>Laps used</span><b>{run.included.length}/{run.laps.length}</b></div>
              <div className="run-actions"><button type="button" className="reset-laps" onClick={() => resetRun(run)}>Reset</button><button type="button" className="remove-run" onClick={() => setRemovedRunIds((current) => [...current, run.run_id])} aria-label={`Remove ${run.driver} stint ${run.stint} from the ${group.compound} view`} title={`Remove this ${group.compound} row`}>×</button></div>
            </div>
          </div>; })}
        </div>
      </div>)}
    </div><aside className="longrun-summary-panel"><section><span className="kicker">Session snapshot</span><h3>Long-run overview</h3><dl><div><dt>Runs shown</dt><dd>{groups.reduce((count, group) => count + group.runs.length, 0)}</dd></div><div><dt>Tyres in view</dt><dd>{groups.length}</dd></div><div><dt>Best compound</dt><dd>{tyreOrder[0]?.compound || "--"}</dd></div><div><dt>Best average</dt><dd>{time(tyreOrder[0]?.best)}</dd></div></dl></section><section><span className="kicker">Tyre pace order</span><ol className="summary-tyre-order">{tyreOrder.map((group, index) => <li key={group.compound}><b>{index + 1}</b><span className={`tyre ${group.compound.toLowerCase()}`}>{group.compound}</span><strong>{time(group.best)}</strong></li>)}</ol></section></aside></div>
  </div>;
}
