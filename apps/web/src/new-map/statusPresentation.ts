import type { CountryCardEntry } from "./map.types";

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

export function formatEnumLabel(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  if (!normalized) return "Unknown";
  return titleCase(normalized);
}

export function formatFlagLabel(flag: string) {
  const normalized = String(flag || "").trim();
  if (!normalized) return "";
  return titleCase(normalized);
}

export function formatFlags(flags: string[] | null | undefined) {
  const values = Array.isArray(flags) ? flags.map(formatFlagLabel).filter(Boolean) : [];
  return values.join(", ");
}

export function formatRecreationalDetail(entry: CountryCardEntry) {
  return [
    formatEnumLabel(entry.normalizedRecreationalStatus),
    formatEnumLabel(entry.normalizedRecreationalEnforcement),
    formatEnumLabel(entry.normalizedRecreationalScope)
  ].join(" · ");
}

export function formatMedicalDetail(entry: CountryCardEntry) {
  return [
    formatEnumLabel(entry.normalizedMedicalStatus),
    formatEnumLabel(entry.normalizedMedicalScope)
  ].join(" · ");
}

export function formatDistributionDetail(entry: CountryCardEntry) {
  return formatEnumLabel(entry.normalizedDistributionStatus);
}
