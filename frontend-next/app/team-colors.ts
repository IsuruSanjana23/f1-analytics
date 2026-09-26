const TEAM_COLORS: Array<[string, string]> = [
  ["ferrari", "#E8002D"],
  ["mercedes", "#00D2BE"],
  ["mclaren", "#FF8000"],
  ["red bull", "#3671C6"],
  ["aston martin", "#229971"],
  ["alpine", "#FF87BC"],
  ["williams", "#1868DB"],
  ["racing bulls", "#6692FF"],
  ["rb", "#6692FF"],
  ["haas", "#B6BABD"],
  ["audi", "#F50537"],
  ["cadillac", "#C9A227"],
];

export function teamColor(team: string | null | undefined) {
  const normalized = (team || "").toLowerCase();
  return TEAM_COLORS.find(([name]) => normalized.includes(name))?.[1] || "#8993A5";
}
