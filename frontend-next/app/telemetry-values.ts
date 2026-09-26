export type Channel = "speed" | "throttle" | "brake" | "rpm" | "gear" | "drs";
type Row = { distance: number } & Record<Channel, number | boolean | null>;

// Compare at the same distance; discrete controls hold their preceding state.
export function valueAt(rows: Row[], distance: number, key: Channel): number | null {
  if (!rows.length || distance < rows[0].distance || distance > rows[rows.length - 1].distance) return null;
  let low = 0, high = rows.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (rows[mid].distance < distance) low = mid + 1;
    else high = mid;
  }
  const next = rows[low];
  if (next.distance === distance) return next[key] == null ? null : Number(next[key]);
  const prev = rows[low - 1];
  if (!prev || prev[key] == null) return null;
  if (["gear", "brake", "drs"].includes(key)) return Number(prev[key]);
  if (next[key] == null) return null;
  return Number(prev[key]) + (Number(next[key]) - Number(prev[key])) * (distance - prev.distance) / (next.distance - prev.distance);
}

export const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;
