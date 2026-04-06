import airportsData from "../../../../data/ai/travel/airports.json";
import cardIndexData from "../../public/new-map-card-index.json";
import { getLawProfile } from "@/lib/lawStore";
import { buildResultViewModel } from "@/lib/resultViewModel";
import { titleForJurisdiction } from "@/lib/jurisdictionTitle";
import { resolveLocation } from "./resolveLocation";

export type AirportEntry = {
  iata: string;
  icao: string;
  name: string;
  country: string;
  region?: string;
  city?: string;
  strict?: boolean;
};

type CardIndexEntry = {
  geo?: string;
  iso2?: string;
  type?: "country" | "state";
  displayName?: string;
  legalStatus?: string;
  medicalStatus?: string;
  notes?: string;
};

type TravelRiskLevel = "high" | "medium" | "low";

type TravelAdvisory = {
  geo: string;
  locationLabel: string;
  riskLevel: TravelRiskLevel;
  text: string;
  sources: string[];
};

type JurisdictionContext = {
  geo: string;
  text: string;
  sources: string[];
};

const airportsByGeo = airportsData as Record<string, AirportEntry[]>;
const cardIndex = cardIndexData as Record<string, CardIndexEntry>;
const TRAVEL_PATTERNS = [
  /\bairport\b/i,
  /\bairports\b/i,
  /\bfly\b/i,
  /\bflight\b/i,
  /\btravel\b/i,
  /\bcarry\b/i,
  /\bborder\b/i,
  /\btransport\b/i,
  /\btransit\b/i,
  /\bdeparture\b/i,
  /\barrive\b/i,
  /аэропорт/i,
  /лет(еть|ать|аю|ишь|им)/i,
  /поездк/i,
  /границ/i,
  /везти/i,
  /перел(ет|ёт)/i
];

function resolveLocationLabel(geo: string) {
  return cardIndex[geo]?.displayName || (geo.startsWith("US-")
    ? titleForJurisdiction({ country: "US", region: geo.slice(3) })
    : titleForJurisdiction({ country: geo }));
}

function buildTravelVm(geo: string) {
  const country = geo.startsWith("US-") ? "US" : geo;
  const region = geo.startsWith("US-") ? geo.slice(3) : undefined;
  const profile = getLawProfile({ country, region });
  if (!profile) return null;
  return buildResultViewModel({
    profile,
    title: titleForJurisdiction({ country, region })
  });
}

function getProfileSourceLabels(geo: string) {
  const country = geo.startsWith("US-") ? "US" : geo;
  const region = geo.startsWith("US-") ? geo.slice(3) : undefined;
  const profile = getLawProfile({ country, region });
  if (!profile?.sources?.length) return [];
  return profile.sources
    .slice(0, 2)
    .map((source) => String(source?.title || source?.url || "").trim())
    .filter(Boolean);
}

function riskLevelForStatus(statusLevel: string | undefined): TravelRiskLevel {
  if (statusLevel === "red" || statusLevel === "gray") return "high";
  if (statusLevel === "yellow") return "medium";
  return "low";
}

function riskText(level: TravelRiskLevel, ru: boolean) {
  if (ru) {
    if (level === "high") return "очень высокий — лучше не рисковать";
    if (level === "medium") return "средний — правила и контроль зависят от юрисдикции";
    return "ниже, но аэропорты и границы всё равно остаются зонами повышенного контроля";
  }
  if (level === "high") return "very high — best not to risk it";
  if (level === "medium") return "moderate — it depends on the jurisdiction and enforcement";
  return "lower, but airports and borders are still high-control zones";
}

export function isTravelQuery(query: string) {
  return TRAVEL_PATTERNS.some((pattern) => pattern.test(query));
}

export function resolveAssistantGeo(query: string, geoHint?: string) {
  return resolveLocation(query, geoHint) || undefined;
}

export function resolveTravelGeo(query: string, geoHint?: string) {
  return resolveAssistantGeo(query, geoHint);
}

export function getAirports(geo?: string) {
  if (!geo) return [];
  const direct = airportsByGeo[geo];
  if (direct?.length) return direct;
  if (geo.startsWith("US-")) return airportsByGeo.US || [];
  return [];
}

export function getGeoCard(geo?: string) {
  if (!geo) return null;
  const entry = cardIndex[geo];
  if (!entry) return null;
  return {
    geo,
    displayName: String(entry.displayName || resolveLocationLabel(geo)),
    legalStatus: String(entry.legalStatus || "Unknown"),
    medicalStatus: String(entry.medicalStatus || "Unknown"),
    notes: String(entry.notes || "").trim()
  };
}

export function buildJurisdictionContext(geo?: string, language?: string): JurisdictionContext | null {
  if (!geo) return null;
  const card = getGeoCard(geo);
  if (!card) return null;
  const ru = /ru/i.test(language || "");
  const sources = getProfileSourceLabels(geo);
  const lines = [
    ru ? `Юрисдикция: ${card.displayName}` : `Jurisdiction: ${card.displayName}`,
    `${ru ? "Recreational" : "Recreational"}: ${card.legalStatus}`,
    `${ru ? "Medical" : "Medical"}: ${card.medicalStatus}`
  ];
  if (card.notes) {
    lines.push(`${ru ? "Notes" : "Notes"}: ${card.notes}`);
  }
  if (sources.length) {
    lines.push(`${ru ? "Official / source context" : "Official / source context"}: ${sources.join("; ")}`);
  }
  return {
    geo,
    text: lines.join("\n"),
    sources: sources.map((source) => `ssot:${geo}:${source}`)
  };
}

export function buildLegalResponse(geo?: string, language?: string) {
  if (!geo) return null;
  const card = getGeoCard(geo);
  const vm = buildTravelVm(geo);
  if (!card || !vm) return null;
  const ru = /ru/i.test(language || "");
  const lines = [
    ru ? `Юрисдикция: ${card.displayName}` : `Jurisdiction: ${card.displayName}`,
    `${ru ? "Status" : "Status"}: ${vm.statusTitle}`,
    `${ru ? "Recreational" : "Recreational"}: ${card.legalStatus}`,
    `${ru ? "Medical" : "Medical"}: ${card.medicalStatus}`
  ];
  if (card.notes) {
    lines.push(`${ru ? "Notes" : "Notes"}: ${card.notes}`);
  }
  if (vm.keyRisks.length) {
    lines.push(`${ru ? "Key risks" : "Key risks"}: ${vm.keyRisks.slice(0, 3).join(", ")}`);
  }
  if (vm.bullets.length) {
    lines.push(`${ru ? "Rule basis" : "Rule basis"}: ${vm.bullets.slice(0, 3).join("; ")}`);
  }
  const sources = getProfileSourceLabels(geo);
  if (sources.length) {
    lines.push(`${ru ? "Official / source context" : "Official / source context"}: ${sources.join("; ")}`);
  }
  lines.push(ru ? "Сравнить с другой страной или штатом?" : "Want a comparison with another country or state?");
  return {
    text: lines.join("\n"),
    sources: [`check:${geo}`, ...sources.map((source) => `ssot:${geo}:${source}`)]
  };
}

export function buildTravelAdvisory(query: string, geoHint?: string, language?: string): TravelAdvisory | null {
  if (!isTravelQuery(query)) return null;
  const geo = resolveTravelGeo(query, geoHint);
  if (!geo) return null;
  const ru = /ru/i.test(language || "") || /[а-яё]/i.test(query);
  const airports = getAirports(geo).slice(0, 3);
  const vm = buildTravelVm(geo);
  const riskLevel = riskLevelForStatus(vm?.statusLevel);
  const locationLabel = resolveLocationLabel(geo);
  const strictHit = airports.find((airport) => airport.strict);
  const lines = [
    ru ? "⚠️ По поездкам:" : "⚠️ Travel:",
    ""
  ];
  if (airports.length) {
    for (const airport of airports) {
      const city = airport.city ? (ru ? `, ${airport.city}` : `, ${airport.city}`) : "";
      lines.push(`— ${airport.name} (${airport.iata})${city}`);
    }
  } else {
    lines.push(ru ? `— Для ${locationLabel} нет готового airport lookup.` : `— No airport lookup was found for ${locationLabel}.`);
  }
  lines.push("");
  lines.push(`${ru ? "Риск" : "Risk"}: ${riskText(riskLevel, ru)}`);
  if (strictHit) {
    lines.push(ru ? `Отдельно: ${strictHit.name} (${strictHit.iata}) отмечен как особенно строгий аэропорт.` : `Extra caution: ${strictHit.name} (${strictHit.iata}) is flagged as a stricter airport.`);
  }
  return {
    geo,
    locationLabel,
    riskLevel,
    text: lines.join("\n"),
    sources: [`airports:${geo}`, `check:${geo}`]
  };
}
