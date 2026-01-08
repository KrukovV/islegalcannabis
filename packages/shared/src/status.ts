import { STATUS_BANNERS } from "./copy/statusBanners";
import type { JurisdictionLawProfile } from "./types";

export type StatusLevel = "green" | "yellow" | "red";

export type StatusResult = {
  level: StatusLevel;
  label: string;
  icon: string;
};

export function computeStatus(profile: JurisdictionLawProfile): StatusResult {
  if (profile.status === "provisional") {
    return {
      level: "yellow",
      label: STATUS_BANNERS.provisional.title,
      icon: "⚠️"
    };
  }

  if (profile.status !== "known") {
    return {
      level: "yellow",
      label: STATUS_BANNERS.needs_review.title,
      icon: "⚠️"
    };
  }

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
