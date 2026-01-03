import type { JurisdictionLawProfile } from "./types";

export type StatusLevel = "green" | "yellow" | "red";

export type StatusResult = {
  level: StatusLevel;
  label: string;
  icon: string;
};

export function computeStatus(profile: JurisdictionLawProfile): StatusResult {
  if (profile.recreational === "allowed") {
    return {
      level: "green",
      label: "Recreational cannabis is legal",
      icon: "✅"
    };
  }

  if (profile.medical === "allowed") {
    return {
      level: "yellow",
      label: "Medical only or restricted",
      icon: "⚠️"
    };
  }

  return {
    level: "red",
    label: "Illegal or highly restricted",
    icon: "⛔"
  };
}
