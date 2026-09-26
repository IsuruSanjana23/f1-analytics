"use client";

import { useState } from "react";
import type { Schemas } from "./lib/api";
import { lapTime } from "./lib/format";
import { teamColor } from "./team-colors";

type Analysis = Schemas["QualifyingAnalysis"];
type Row = {
  position: number;
  driver: string;
  team: string | null;
  compound: string | null;
  lap_number: number;
  lap_time_seconds: number;
  gap: number;
  segment: string | null;
  attempts: number[];
  out: boolean;
};

const OVERALL = "Overall";

/**
 * Official-style order: drivers are ranked by their time in the last segment
 * they reached, so everyone who made Q3 is ahead of everyone knocked out in Q2.
 */
function classification(data: Analysis): Row[] {
  const seen = new Set<string>();
  const rows: Row[] = [];
  [...data.segments].reverse().forEach((segment, index, reversed) => {
    const isFinal = index === 0;
    segment.results.forEach((result) => {
      if (seen.has(result.driver)) return;
      seen.add(result.driver);
      rows.push({ ...result, position: rows.length + 1, gap: result.gap_to_segment_best, segment: segment.segment, attempts: attemptTimes(data, result.driver, segment.segment), out: !isFinal && reversed.length > 1 });
    });
  });
  return rows;
}

function segmentRows(data: Analysis, name: string): Row[] {
  const index = data.segments.findIndex((segment) => segment.segment === name);
  const next = data.segments[index + 1];
  // A driver who sets no time in the next segment was knocked out here.
  const advanced = next ? new Set(next.results.map((result) => result.driver)) : null;
  return data.segments[index].results.map((result) => ({
    ...result, gap: result.gap_to_segment_best, segment: name,
    attempts: attemptTimes(data, result.driver, name), out: advanced ? !advanced.has(result.driver) : false,
  }));
}

function bestLapRows(data: Analysis): Row[] {
  return data.best_laps.filter((lap) => lap.lap_time_seconds != null).map((lap) => ({
    position: lap.position, driver: lap.driver, team: lap.team, compound: lap.compound, lap_number: lap.lap_number,
    lap_time_seconds: lap.lap_time_seconds!, gap: lap.gap_to_fastest, segment: null,
    attempts: attemptTimes(data, lap.driver, null), out: false,
  }));
}

function attemptTimes(data: Analysis, driver: string, segment: string | null) {
  return data.attempts
    .filter((attempt) => attempt.driver === driver && (segment == null || attempt.segment === segment) && attempt.lap_time_seconds != null)
    .sort((a, b) => a.lap_number - b.lap_number)
    .map((attempt) => attempt.lap_time_seconds!);
}

export default function QualifyingBoard({ data, error, isQualifying, selectedDrivers }: { data: Analysis | undefined; error?: string; isQualifying: boolean; selectedDrivers: string[] }) {
  const [view, setView] = useState(OVERALL);
  if (!isQualifying) return <p className="chart-empty">Load a qualifying session (Q, SQ or SS) to see the Q1 / Q2 / Q3 breakdown.</p>;
  if (error) return <p className="chart-empty" role="alert">Qualifying analysis unavailable: {error}</p>;
  if (!data) return <p className="chart-empty">Loading qualifying analysis...</p>;

  const hasSegments = data.segments.length > 0;
  const activeView = hasSegments && data.segments.some((segment) => segment.segment === view) ? view : OVERALL;
  const rows = activeView !== OVERALL ? segmentRows(data, activeView) : hasSegments ? classification(data) : bestLapRows(data);
  if (!rows.length) return <p className="chart-empty">No timed qualifying laps in this session.</p>;

  const leader = rows[0];
  const maxGap = Math.max(0.001, ...rows.map((row) => row.gap));
  const firstOut = rows.findIndex((row) => row.out);
  const cutoff = activeView !== OVERALL && firstOut > 0 ? rows[firstOut].lap_time_seconds - rows[firstOut - 1].lap_time_seconds : null;
  // Overall view: a line between the Q3, Q2 and Q1 groups. Segment view: at the elimination cut.
  const cutBefore = (index: number) => activeView === OVERALL ? hasSegments && index > 0 && rows[index].segment !== rows[index - 1].segment : index === firstOut && firstOut > 0;
  const title = activeView === OVERALL ? hasSegments ? "Qualifying classification" : "Best laps" : `${activeView} classification`;

  return <div className="qualifying-board">
    <section className="quali-hero">
      <div><p>{activeView === OVERALL ? "Pole position" : `${activeView} fastest`}</p><h3><span className="stat-driver-rail" style={{ background: teamColor(leader.team) }}></span>{leader.driver}<b>{lapTime(leader.lap_time_seconds)}</b></h3></div>
      <div><p>{cutoff != null ? "Margin at the cut" : "Drivers classified"}</p><h3>{cutoff != null ? <b>{cutoff.toFixed(3)} s</b> : <b>{rows.length}</b>}</h3></div>
      <div><p>Timed attempts</p><h3><b>{rows.reduce((count, row) => count + row.attempts.length, 0)}</b></h3></div>
    </section>
    <div className="quali-segments">
      <div className="segmented" aria-label="Qualifying segment">{[OVERALL, ...data.segments.map((segment) => segment.segment)].map((name) => <button key={name} type="button" aria-pressed={activeView === name} onClick={() => setView(name)}>{name}</button>)}</div>
      <small>{hasSegments ? activeView === OVERALL ? "Ranked by time in the last segment each driver reached; gaps are to that segment's best" : "Dashed line marks the elimination cut" : "Segment split unavailable for this session; showing each driver's best lap"}</small>
    </div>
    <div className="timing-table table-card qualifying-table"><table aria-label={title}>
      <thead><tr><th>Pos</th><th>Driver</th><th>Team</th><th>Tyre</th><th>Lap time</th><th>{activeView === OVERALL && hasSegments ? "Gap in segment" : "Gap"}</th><th>Attempts</th><th>Lap</th><th>{activeView === OVERALL ? "Reached" : "Result"}</th></tr></thead>
      <tbody>{rows.map((row, index) => {
        const best = Math.min(...row.attempts);
        return [
          cutBefore(index) ? <tr className="quali-cutoff" key="cutoff" aria-hidden="true"><td colSpan={9}></td></tr> : null,
          <tr key={row.driver} className={[row.out ? "quali-out" : "", selectedDrivers.includes(row.driver) ? "selected-driver-row" : ""].join(" ").trim()}>
            <td className="timing-position">{String(row.position).padStart(2, "0")}</td>
            <td><span className="team-rail" style={{ background: teamColor(row.team) }}></span><strong>{row.driver}</strong></td>
            <td>{row.team || "--"}</td>
            <td><span className={`compound-badge ${row.compound?.toLowerCase() || ""}`}>{row.compound?.charAt(0) || "-"}</span></td>
            <td className="timing-value">{lapTime(row.lap_time_seconds)}</td>
            <td><div className="quali-gap"><span className={row.gap === 0 ? "gain" : "loss"}>{row.gap === 0 ? "BEST" : `+${row.gap.toFixed(3)}`}</span><i style={{ width: `${Math.round(row.gap / maxGap * 70)}px` }}></i></div></td>
            <td><div className="quali-attempts">{row.attempts.map((seconds, attempt) => <span key={attempt} className={seconds === best ? "best" : undefined}>{lapTime(seconds)}</span>)}</div></td>
            <td>L{row.lap_number}</td>
            <td>{activeView === OVERALL ? <span className="quali-status">{row.segment ?? "--"}</span> : <span className={`quali-status ${row.out ? "out" : "through"}`}>{row.out ? "Out" : data.segments.at(-1)?.segment === activeView ? "Final" : "Through"}</span>}</td>
          </tr>,
        ];
      })}</tbody>
    </table></div>
  </div>;
}
