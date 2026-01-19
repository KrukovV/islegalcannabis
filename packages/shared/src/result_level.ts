export type ResultLevel = "green" | "yellow" | "red";
export type DetectMethod = "gps" | "ip" | "manual";

export function levelFromStatus(status: string): ResultLevel {
  if (status === "recreational_legal") return "green";
  if (status === "medical_only" || status === "medical_only_or_restricted") {
    return "yellow";
  }
  return "red";
}

export function titleFromLevel(level: ResultLevel, status?: string): string {
  if (status === "needs_review" || status === "unknown" || status === "error") {
    return "Not sure";
  }
  if (level === "green") return "Legal";
  if (level === "yellow") return "Restricted";
  return "Not legal / Unknown";
}
