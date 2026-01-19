import { normalizeSources } from "./sources.js";

const REQUIRED_FIELDS = ["medical", "recreational", "public_use", "cross_border"];

export function isLawKnown(profile, registries) {
  if (!profile) return false;
  for (const field of REQUIRED_FIELDS) {
    const value = profile?.[field];
    if (!value || String(value).toLowerCase() === "unknown") {
      return false;
    }
  }
  return normalizeSources(profile.sources, registries).official.length >= 1;
}
