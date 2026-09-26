import { teamColor } from "./team-colors";

type FastestLap = { position: number; driver: string; driver_number: string | null; team: string | null; compound: string | null; lap_time_seconds: number | null; gap_to_fastest: number | null; sector_1_seconds: number | null; sector_2_seconds: number | null; sector_3_seconds: number | null; top_speed: number | null; lap_number: number | null };
export type SessionBoardData = { fastest_laps: FastestLap[] } | null;

const time = (value: number | null) => value == null ? "--" : `${Math.floor(value / 60)}:${(value % 60).toFixed(3).padStart(6, "0")}`;

export default function SessionBoard({ data, error, selectedDrivers, onTelemetry }: { data: SessionBoardData; error?: string; selectedDrivers: string[]; onTelemetry: () => void }) {
  if (error) return <p className="chart-empty" role="alert">Timing classification unavailable: {error}</p>;
  if (!data) return <p className="chart-empty">Loading timing classification...</p>;
  const fastest = data.fastest_laps[0];
  const gaps = data.fastest_laps.map((lap) => lap.gap_to_fastest).filter((value): value is number => value != null);
  const fieldSpread = gaps.length ? Math.max(...gaps) : null;
  const tyresInPlay = Array.from(new Set(data.fastest_laps.map((lap) => lap.compound).filter((value): value is string => Boolean(value))));
  return <div className="session-board">
    <div className="stat-strip">
      <div><span>Session best</span><b>{time(fastest?.lap_time_seconds ?? null)}</b></div>
      <div><span>Set by</span><b><span className="stat-driver-rail" style={{ background: teamColor(fastest?.team) }}></span>{fastest ? `${fastest.driver}${fastest.driver_number ? ` #${fastest.driver_number}` : ""}` : "--"}</b></div>
      <div><span>Field spread</span><b>{fieldSpread == null ? "--" : `${fieldSpread.toFixed(3)} s`}</b></div>
      <div><span>Tyres in play</span><div className="stat-tyres">{tyresInPlay.length ? tyresInPlay.map((compound) => <span key={compound} className={`compound-badge ${compound.toLowerCase()}`}>{compound.charAt(0)}</span>) : <span className="muted">--</span>}</div></div>
    </div>
    <div className="session-meta-row"><span>{data.fastest_laps.length} drivers with valid laps <b>·</b> <strong>{selectedDrivers.join(" / ") || "No drivers selected"}</strong></span><button type="button" onClick={onTelemetry}>Compare selected telemetry</button></div>
    <div className="timing-layout"><div className="timing-table table-card"><table><thead><tr><th>Pos</th><th>Driver</th><th>Team</th><th>Tyre</th><th>Lap time</th><th>Gap</th><th>S1</th><th>S2</th><th>S3</th><th>Vmax</th><th>Lap</th></tr></thead><tbody>{data.fastest_laps.map((lap) => <tr className={selectedDrivers.includes(lap.driver) ? "selected-driver-row" : ""} key={lap.driver}><td className="timing-position">{String(lap.position).padStart(2, "0")}</td><td><span className="team-rail" style={{ background: teamColor(lap.team) }}></span><strong>{lap.driver}</strong> <small>#{lap.driver_number || "--"}</small></td><td>{lap.team || "--"}</td><td><span className={`compound-badge ${lap.compound?.toLowerCase() || ""}`}>{lap.compound?.charAt(0) || "-"}</span></td><td className="timing-value">{time(lap.lap_time_seconds)}</td><td className={lap.position === 1 ? "gain" : "loss"}>{lap.position === 1 ? "LEADER" : `+${lap.gap_to_fastest?.toFixed(3) || "--"}`}</td><td>{time(lap.sector_1_seconds)}</td><td>{time(lap.sector_2_seconds)}</td><td>{time(lap.sector_3_seconds)}</td><td>{lap.top_speed ? `${lap.top_speed} km/h` : "--"}</td><td>L{lap.lap_number || "--"}</td></tr>)}</tbody></table></div></div>
  </div>;
}
