import airportsData from "../../../../data/ai/travel/airports.json";
import travelRisksData from "../../../../data/ai/travel/travel_risks.json";
import cardIndexData from "../../public/new-map-card-index.json";
import { getLawProfile } from "@/lib/lawStore";
import { buildResultViewModel } from "@/lib/resultViewModel";
import { titleForJurisdiction } from "@/lib/jurisdictionTitle";
import { resolveLocation } from "./resolveLocation";
import { getWikiTruthExplainability } from "./wikiTruthExplainability";

export type AirportEntry = {
  iata: string;
  icao: string;
  name: string;
  country: string;
  region?: string;
  city?: string;
  type?: string;
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

type TravelRiskDatasetRow = {
  risk?: TravelRiskLevel;
  strictAirports?: string[];
  notes?: { en?: string; ru?: string };
};

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
const travelRiskByGeo = travelRisksData as Record<string, TravelRiskDatasetRow>;
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

function localizeLabel(ru: boolean, enLabel: string, ruLabel: string) {
  return ru ? ruLabel : enLabel;
}

function getTravelRiskConfig(geo: string) {
  return travelRiskByGeo[geo] || (geo.startsWith("US-") ? travelRiskByGeo.US : null) || travelRiskByGeo.default || null;
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
  const explainability = getWikiTruthExplainability(geo);
  const sources = getProfileSourceLabels(geo);
  const lines = [
    ru ? `Юрисдикция: ${card.displayName}` : `Jurisdiction: ${card.displayName}`
  ];
  if (explainability?.notes || card.notes) {
    lines.push(`${localizeLabel(ru, "Normalized notes", "Нормализованные Notes")}: ${explainability?.notes || card.notes}`);
  }
  if (explainability?.socialReality) {
    lines.push(`${localizeLabel(ru, "Social reality", "Social reality")}: ${explainability.socialReality}`);
  }
  if (sources.length) {
    lines.push(`${localizeLabel(ru, "Official / source context", "Official / source context")}: ${sources.join("; ")}`);
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
  const explainability = getWikiTruthExplainability(geo);
  const lines = [
    ru ? `Юрисдикция: ${card.displayName}` : `Jurisdiction: ${card.displayName}`,
    `${localizeLabel(ru, "Normalized notes", "Нормализованные Notes")}: ${explainability?.notes || card.notes || (ru ? "нет notes" : "no notes available")}`
  ];
  if (explainability?.socialReality) {
    lines.push(`${localizeLabel(ru, "Social reality", "Social reality")}: ${explainability.socialReality}`);
  }
  lines.push(
    `${localizeLabel(ru, "Final legal summary", "Итоговое legal summary")}: ${vm.statusTitle}`,
    `${localizeLabel(ru, "Recreational", "Recreational")}: ${card.legalStatus}`,
    `${localizeLabel(ru, "Medical", "Medical")}: ${card.medicalStatus}`
  );
  if (vm.keyRisks.length) {
    lines.push(`${localizeLabel(ru, "Practical risk", "Практический риск")}: ${vm.keyRisks.slice(0, 3).join(", ")}`);
  }
  const sources = getProfileSourceLabels(geo);
  lines.push(
    `${localizeLabel(ru, "Official corroboration", "Official corroboration")}: ${explainability?.corroboration || (ru ? "данных мало" : "limited")}`
  );
  if (explainability?.officialLinksSummary) {
    lines.push(`${localizeLabel(ru, "Official links", "Official links")}: ${explainability.officialLinksSummary}`);
  }
  if (sources.length) {
    lines.push(`${localizeLabel(ru, "Representative sources", "Representative sources")}: ${sources.join("; ")}`);
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
  const riskConfig = getTravelRiskConfig(geo);
  const riskLevel = riskConfig?.risk || riskLevelForStatus(vm?.statusLevel);
  const locationLabel = resolveLocationLabel(geo);
  const strictAirportCodes = new Set((riskConfig?.strictAirports || []).map((code) => String(code).toUpperCase()));
  const strictHit = airports.find((airport) => airport.strict || strictAirportCodes.has(String(airport.iata || "").toUpperCase()));
  const explainability = getWikiTruthExplainability(geo);
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
  if (riskConfig?.notes?.[ru ? "ru" : "en"]) {
    lines.push(riskConfig.notes[ru ? "ru" : "en"] as string);
  }
  if (explainability?.notes) {
    lines.push(`${localizeLabel(ru, "Normalized notes", "Нормализованные Notes")}: ${explainability.notes}`);
  }
  if (explainability?.socialReality) {
    lines.push(`${localizeLabel(ru, "Social reality", "Social reality")}: ${explainability.socialReality}`);
  }
  if (vm?.keyRisks.length) {
    lines.push(`${localizeLabel(ru, "Practical risk", "Практический риск")}: ${vm.keyRisks.slice(0, 2).join(", ")}`);
  }
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
