import { listIsoMeta } from "@islegal/shared";
import countriesAliasesData from "../../../../data/ai/countries_aliases.json";
import statesUsData from "../../../../data/ai/states_us.json";
import cardIndexData from "../../public/new-map-card-index.json";

const statesUs = statesUsData as Record<string, string>;
const countriesAliases = countriesAliasesData as Record<string, string>;
const cardIndex = cardIndexData as Record<string, { displayName?: string; geo?: string }>;

type AliasEntry = {
  geo: string;
  label: string;
};

function normalizeQuery(value: string) {
  return value.toLowerCase().replace(/[_.,!?;:()[\]{}]+/g, " ").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildCountryAliases() {
  const entries = new Map<string, AliasEntry>();
  for (const [label, geo] of Object.entries(countriesAliases)) {
    const normalized = String(label).trim().toLowerCase();
    const normalizedGeo = String(geo || "").trim().toUpperCase();
    if (!normalized || !/^[A-Z]{2}$/.test(normalizedGeo)) continue;
    entries.set(`${normalizedGeo}:${normalized}`, { geo: normalizedGeo, label: normalized });
  }
  for (const meta of listIsoMeta()) {
    const labels = [meta.name].filter(Boolean);
    for (const label of labels) {
      const normalized = String(label).trim().toLowerCase();
      if (!normalized) continue;
      entries.set(`${meta.alpha2}:${normalized}`, { geo: meta.alpha2, label: normalized });
    }
  }
  for (const [geo, entry] of Object.entries(cardIndex)) {
    if (geo.startsWith("US-")) continue;
    const label = String(entry?.displayName || "").trim().toLowerCase();
    if (!label) continue;
    entries.set(`${geo}:${label}`, { geo, label });
  }
  return Array.from(entries.values()).sort((left, right) => right.label.length - left.label.length);
}

function buildStateAliases() {
  return Object.entries(statesUs)
    .map(([label, geo]) => ({ geo, label: label.toLowerCase() }))
    .sort((left, right) => right.label.length - left.label.length);
}

const countryAliases = buildCountryAliases();
const stateAliases = buildStateAliases();

function hasExplicitUppercaseToken(query: string, label: string) {
  return new RegExp(`(^|[^A-Z0-9])${escapeRegExp(label.toUpperCase())}($|[^A-Z0-9])`).test(query);
}

function findBestAlias(query: string, aliases: AliasEntry[], options?: { geoHint?: string; stateMode?: boolean }) {
  const normalized = normalizeQuery(query);
  let best: { geo: string; index: number; labelLength: number } | null = null;
  for (const entry of aliases) {
    if (options?.stateMode && entry.label.length <= 2) {
      const allowShort =
        String(options.geoHint || "").toUpperCase() === "US" ||
        String(options.geoHint || "").toUpperCase().startsWith("US-") ||
        hasExplicitUppercaseToken(query, entry.label);
      if (!allowShort) continue;
    }
    const pattern = new RegExp(`(^|[^a-zа-я0-9])${escapeRegExp(entry.label)}($|[^a-zа-я0-9])`, "i");
    const match = pattern.exec(normalized);
    if (!match || match.index < 0) continue;
    const candidate = { geo: entry.geo, index: match.index, labelLength: entry.label.length };
    if (!best || candidate.index < best.index || (candidate.index === best.index && candidate.labelLength > best.labelLength)) {
      best = candidate;
    }
  }
  return best?.geo || null;
}

export function normalizeState(query: string, geoHint?: string) {
  return findBestAlias(query, stateAliases, { geoHint, stateMode: true });
}

export function normalizeCountry(query: string) {
  return findBestAlias(query, countryAliases);
}

export function resolveLocation(query: string, geoHint?: string) {
  return normalizeState(query, geoHint) || normalizeCountry(query) || geoHint || null;
}
