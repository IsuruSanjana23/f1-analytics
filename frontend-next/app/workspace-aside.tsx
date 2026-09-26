import type { Driver, Lap, LongRunSummary } from "./lib/api";
import { lapTime } from "./lib/format";

type Props = {
  driver: Driver | undefined;
  summary: Record<string, number | null>;
  laps: Lap[];
  runs: LongRunSummary[];
  selected: Lap | undefined;
  selectedLap: number | undefined;
  referenceDriver: string | undefined;
  status: string;
  onClear: () => void;
  onTelemetry: () => void;
};

export default function WorkspaceAside({ driver, summary, laps, runs, selected, selectedLap, referenceDriver, status, onClear, onTelemetry }: Props) {
  const incomplete = laps.filter((lap) => lap.lap_time_seconds == null).length;
  return <aside className="aside">
    <div className="driver-card"><div className="number">{driver?.number || "--"}</div><div><span className="kicker">Reference driver</span><h2>{driver?.full_name || referenceDriver || "Select a driver"}</h2><p>{driver?.team || "--"}</p></div></div>
    <div className="metrics">
      <Metric label="Fastest lap" value={lapTime(summary.fastest_lap_seconds)} />
      <Metric label="Median pace" value={lapTime(summary.median_lap_seconds)} />
      <Metric label="Best top speed" value={laps.length ? `${Math.max(...laps.map((lap) => lap.top_speed || 0))} km/h` : "--"} />
      <Metric label="Long runs" value={`${runs.length} detected`} />
    </div>
    <div className="read-card"><div className="card-head"><h3>Race engineer read</h3><span className="signal">●</span></div><p>{laps.length} laps recorded. {incomplete} laps have no complete time. {runs.length} representative long runs detected.</p><div className="tags"><span>{status}</span></div></div>
    <div className="compare-card"><div className="card-head"><h3>Comparison tray</h3><button onClick={onClear}>Clear</button></div>{referenceDriver ? <div className="compare-item"><b>A</b><span><strong>{referenceDriver} · Lap {selectedLap ?? "--"}</strong><small>{lapTime(selected?.lap_time_seconds)} · {selected?.compound}</small></span></div> : <p className="muted">Select drivers above to begin a comparison.</p>}<button className="compare-button" onClick={onTelemetry}>Open telemetry view ↗</button></div>
  </aside>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}
