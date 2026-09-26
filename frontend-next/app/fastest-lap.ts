export type TimedLap = {
  lap_number: number;
  lap_time_seconds: number | null;
  deleted?: boolean;
  pit_in?: boolean;
  pit_out?: boolean;
  classification?: string;
};

export function fastestLap<T extends TimedLap>(laps: T[]): T | undefined {
  return laps.filter(l => l.lap_time_seconds != null && Number.isFinite(l.lap_time_seconds)
    && l.lap_time_seconds > 0 && !l.deleted && !l.pit_in && !l.pit_out
    && !["deleted_lap", "in_lap", "out_lap"].includes(l.classification || ""))
    .sort((a, b) => a.lap_time_seconds! - b.lap_time_seconds! || a.lap_number - b.lap_number)[0];
}
