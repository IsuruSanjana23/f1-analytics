export function lapTime(value: number | null | undefined, empty = "-") {
  if (value == null || !Number.isFinite(value)) return empty;
  return `${Math.floor(value / 60)}:${(value % 60).toFixed(3).padStart(6, "0")}`;
}

export function compoundClass(value: string | null | undefined) {
  return (value || "unknown").toLowerCase();
}
