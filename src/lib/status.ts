import type { JurisdictionLawProfile } from "@/lib/types";

export type StatusLevel = "green" | "yellow" | "red";

export type StatusResult = {
  level: StatusLevel;
  label: string;
};

export function computeStatus(profile: JurisdictionLawProfile): StatusResult {
  if (profile.recreational === "allowed") {
    return { level: "green", label: "Recreational cannabis is legal" };
  }

  if (profile.medical === "allowed") {
    return { level: "yellow", label: "Medical only or restricted" };
  }

  return { level: "red", label: "Illegal or highly restricted" };
}
