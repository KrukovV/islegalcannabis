import os from "node:os";
import socialRealityData from "../../../../data/generated/socialReality.global.json";
import { getCountryPageIndexByGeoCode, getCountryPageIndexByIso2 } from "@/lib/countryPageStorage";
import { findNearbyTruth } from "@/lib/geo/nearbyTruth";
import { deriveResultStatusFromCountryPageData } from "@/lib/resultStatus";
import { buildMessages, type LlmMessage } from "./prompt";
import type { AIContext, AIResponse, RagChunk } from "./types";
import { detectIntent, getDialogState, isBasicLawQuery, isContinuationQuery, isGlobalCultureQuery, isProductRiskQuery, isSmallAmountRiskQuery, isTraceRiskQuery, isTravelRiskQuery, rememberDialog } from "./dialog";
import { getTravelRiskBlock } from "./rag";
import { retrieveMemory, saveMemory, scoreMemory } from "./memory";
import { applyDialogStyle, fallbackHumanized } from "./dialogStyle";
import {
  AIConnectionError,
  generateWithProvider,
  resolveAIProvider,
  verifyProviderConnection,
  warmProviderModel
} from "./provider";

const MAX_CPU_LOAD_RATIO = 0.9;
const OLLAMA_COOLDOWN_MS = 60000;
let donationShown = false;
let ollamaInferenceRunning = false;
let ollamaCooldownUntil = 0;
let jurisdictionAliasCache: Array<{ alias: string; geo: string }> | null = null;
const RU_OPENERS = ["Смотри спокойно:", "Если по факту:", "Тут есть нюанс:", "Интересный момент:"];
const EN_OPENERS = ["Calm version:", "If we keep it real:", "Here is the nuance:", "Interesting angle:"];

type SocialRealityPayload = {
  entries?: Array<{
    id?: string;
    country?: string;
    display_name?: string;
    note_summary?: string;
    confidence_score?: number;
  }>;
};

const socialRealityEntries = (socialRealityData as SocialRealityPayload).entries || [];
let countryPageIndexByIso2Cache: ReturnType<typeof getCountryPageIndexByIso2> | null = null;
let countryPageIndexByGeoCodeCache: ReturnType<typeof getCountryPageIndexByGeoCode> | null = null;
const COMPARE_QUERY_RE = /compare|vs\.?|versus|than|safer|better|difference|which is safer|which one is safer|why/i;

function getCountryPageForHint(geoHint: string | undefined) {
  if (!geoHint) return null;
  if (!countryPageIndexByIso2Cache) countryPageIndexByIso2Cache = getCountryPageIndexByIso2();
  if (!countryPageIndexByGeoCodeCache) countryPageIndexByGeoCodeCache = getCountryPageIndexByGeoCode();
  const normalized = String(geoHint || "").trim().toUpperCase();
  if (!normalized) return null;
  if (normalized.startsWith("US-")) {
    return countryPageIndexByGeoCodeCache.get(normalized) || null;
  }
  if (normalized.length === 2) {
    return countryPageIndexByIso2Cache.get(normalized) || null;
  }
  return null;
}

function getJurisdictionAliases() {
  if (jurisdictionAliasCache) return jurisdictionAliasCache;
  if (!countryPageIndexByGeoCodeCache) countryPageIndexByGeoCodeCache = getCountryPageIndexByGeoCode();
  const aliases: Array<{ alias: string; geo: string }> = [];
  for (const [geo, page] of countryPageIndexByGeoCodeCache.entries()) {
    const lowerName = String(page.name || "").toLowerCase();
    if (lowerName) aliases.push({ alias: lowerName, geo });
    if (geo.startsWith("US-")) {
      aliases.push({ alias: lowerName.replace(/,?\s+us$/i, ""), geo });
      aliases.push({ alias: lowerName.replace(/,?\s+united states$/i, ""), geo });
    }
  }
  aliases.push(
    { alias: "netherlands", geo: "NL" },
    { alias: "the netherlands", geo: "NL" },
    { alias: "dutch", geo: "NL" },
    { alias: "uae", geo: "AE" },
    { alias: "dubai", geo: "AE" },
    { alias: "california", geo: "US-CA" },
    { alias: "thailand", geo: "TH" },
    { alias: "germany", geo: "DE" }
  );
  jurisdictionAliasCache = aliases.sort((left, right) => right.alias.length - left.alias.length);
  return jurisdictionAliasCache;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasAlias(text: string, alias: string) {
  const escaped = escapeRegExp(alias.trim());
  if (!escaped) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "iu").test(text);
}

function resolveMentionedJurisdictions(query: string) {
  const normalizedQuery = String(query || "").toLowerCase();
  const seen = new Set<string>();
  const pages = [];
  for (const entry of getJurisdictionAliases()) {
    if (!hasAlias(normalizedQuery, entry.alias)) continue;
    if (seen.has(entry.geo)) continue;
    const page = getCountryPageForHint(entry.geo);
    if (!page) continue;
    seen.add(entry.geo);
    pages.push(page);
  }
  return pages;
}

function resolveHistoryComparePage(history: ReturnType<typeof getDialogState>, lockedPageGeo?: string | null) {
  const previousThread = [history.lastUser, history.lastAssistant, history.lastQuery].filter(Boolean).join(" ");
  if (!previousThread) return null;
  return (
    resolveMentionedJurisdictions(previousThread).find((page) => page.geo_code !== lockedPageGeo) || null
  );
}

function isComparisonQuery(query: string) {
  return COMPARE_QUERY_RE.test(String(query || ""));
}

function resolveLocationSelection(
  query: string,
  history: ReturnType<typeof getDialogState>,
  geoHint: string | undefined
) {
  const mentioned = resolveMentionedJurisdictions(query);
  const lockedPage = history.lastLocation ? getCountryPageForHint(history.lastLocation) : null;
  const hintedPage = getCountryPageForHint(geoHint);
  const comparison = isComparisonQuery(query);

  if (mentioned.length) {
    if (comparison && (lockedPage || hintedPage)) {
      const primaryPage = lockedPage || hintedPage;
      const comparePage = mentioned.find((page) => page.geo_code !== primaryPage?.geo_code) || null;
      return {
        primary: primaryPage,
        compare: comparePage,
        source: lockedPage ? "user" as const : "geo" as const
      };
    }
    return {
      primary: mentioned[0],
      compare: mentioned.find((page) => page.geo_code !== mentioned[0].geo_code) || null,
      source: "user" as const
    };
  }

  if (lockedPage) {
    const comparePage =
      comparison || isContinuationQuery(query)
        ? resolveHistoryComparePage(history, lockedPage.geo_code)
        : null;
    return {
      primary: lockedPage,
      compare: comparePage,
      source: (history.source || "ui") as "user" | "ui" | "geo"
    };
  }

  return {
    primary: hintedPage,
    compare: null,
    source: "geo" as const
  };
}

function detectLanguage(query: string, language: string | undefined) {
  if (/[А-Яа-яЁё]/.test(query)) return "ru";
  if (/^[\t\n\r -~]+$/.test(query)) return "en";
  return language || "en";
}

function isCasualQuery(query: string) {
  return /^(how are you|how's it going|hows it going|what's up|whats up|как дела|как ты|ты как|ты здесь)\??$/i.test(
    String(query || "").trim()
  );
}

function getSocialReality(geoHint: string | null) {
  if (!geoHint) return null;
  const normalized = geoHint.toUpperCase();
  const entry = socialRealityEntries.find((item) => {
    const id = String(item.id || "").toUpperCase();
    const country = String(item.country || "").toUpperCase();
    return id === normalized || country === normalized;
  });
  if (!entry) return null;
  return {
    summary: entry.note_summary || null,
    confidence: typeof entry.confidence_score === "number" ? entry.confidence_score : null
  };
}

function getAirportSummary(query: string, context: ReturnType<typeof buildContext>) {
  const riskBlock = getTravelRiskBlock(query);
  const importIllegal = context.legal?.distribution === "mixed" || context.legal?.distribution === "illegal";
  const usFederalConflict = context.location.geoHint?.startsWith("US-");
  if (usFederalConflict) {
    return "Airports stay restricted because federal law can still conflict with state-level cannabis access.";
  }
  if (importIllegal && riskBlock) {
    return `${riskBlock.bullets[0]}. ${riskBlock.bullets[1]}.`;
  }
  if (riskBlock) {
    return riskBlock.bullets.join(" ");
  }
  return null;
}

function shouldUseNearbyTruth(query: string, context: AIContext) {
  return Boolean(
    context.nearby &&
      (
        context.intent === "nearby" ||
        context.history.lastIntent === "nearby" ||
        /near me|nearest|nearby|closest|distance|safer|which option|tolerated|around me|border|what about borders|risk on the way|in real life|ближайш|рядом|куда ближе|что ближе|какой вариант безопаснее|границ|риск/i.test(
          query
        )
      )
  );
}

export function buildContext(
  query: string,
  geoHint: string | undefined,
  coords: { lat?: number | null; lng?: number | null } | undefined,
  contextChunks: RagChunk[],
  language: string | undefined,
  memoryItems: AIContext["memory"] = []
): AIContext {
  const resolvedLanguage = detectLanguage(query, language);
  const history = getDialogState();
  const detectedIntent = detectIntent(query);
  const locationSelection =
    detectedIntent === "nearby"
      ? {
          primary: getCountryPageForHint(history.lastLocation || geoHint),
          compare: null,
          source: history.lastLocation ? ((history.source || "ui") as "user" | "ui" | "geo") : ("geo" as const)
        }
      : resolveLocationSelection(query, history, geoHint);
  const countryPage = locationSelection.primary;
  const comparePage = locationSelection.compare;
  const effectiveGeoHint = countryPage?.iso2 || countryPage?.geo_code || geoHint;
  const social = getSocialReality(effectiveGeoHint || null);
  const nearbyFollowUp =
    history.lastIntent === "nearby" &&
    (
      isContinuationQuery(query) ||
      /(nearest|near me|nearby|closest|distance|border|safer|tolerated|limited|which option|what about borders|risk on the way|in real life|distance|warning|поблизости|рядом|границ|риск|куда ближе|где ближе)/i.test(
        query
      )
    );
  const intent = nearbyFollowUp ? "nearby" : detectedIntent;
  const casual = isCasualQuery(query);
  const includeLegal = !casual && intent !== "culture";
  const includeCulture = intent === "culture" || /420|reggae|marley|music|culture|artist|song|movie/i.test(query);
  const culture = contextChunks
    .filter((chunk) => chunk.kind === "culture" && includeCulture)
    .slice(0, 2)
    .map((chunk) => ({
      title: chunk.title,
      text: chunk.text,
      source: chunk.source
    }));
  const legal = countryPage && includeLegal
    ? {
        resultStatus: deriveResultStatusFromCountryPageData(countryPage),
        recreational: countryPage.legal_model.recreational.status,
        medical: countryPage.legal_model.medical.status,
        distribution: countryPage.legal_model.distribution.status,
        finalRisk: countryPage.legal_model.signals?.final_risk || "UNKNOWN",
        prison: Boolean(countryPage.legal_model.signals?.penalties?.prison),
        arrest: Boolean(countryPage.legal_model.signals?.penalties?.arrest)
      }
    : null;
  const nearby =
    intent === "nearby"
      ? findNearbyTruth({
          geoHint,
          lat: coords?.lat,
          lng: coords?.lng
        })
      : null;

  const assistantContext: AIContext = {
    query,
    language: resolvedLanguage,
    location: {
      geoHint: effectiveGeoHint || null,
      name: countryPage?.name || null,
      source: locationSelection.source,
      lat: coords?.lat ?? countryPage?.coordinates?.lat ?? null,
      lng: coords?.lng ?? countryPage?.coordinates?.lng ?? null
    },
    intent,
    legal,
    notes: includeLegal ? countryPage?.notes_normalized || null : null,
    enforcement: countryPage && includeLegal
      ? {
          level: countryPage.legal_model.signals?.enforcement_level || null,
          recreational: countryPage.legal_model.recreational.enforcement
        }
      : null,
    medical: countryPage && includeLegal
      ? {
          status: countryPage.legal_model.medical.status,
          scope: countryPage.legal_model.medical.scope
        }
      : null,
    social: casual ? null : social,
    airports: {
      summary: getAirportSummary(query, {
        query,
        language: resolvedLanguage,
        location: {
          geoHint: effectiveGeoHint || null,
          name: countryPage?.name || null,
          lat: coords?.lat ?? countryPage?.coordinates?.lat ?? null,
          lng: coords?.lng ?? countryPage?.coordinates?.lng ?? null
        },
        intent,
        legal,
          notes: includeLegal ? countryPage?.notes_normalized || null : null,
          enforcement: countryPage && includeLegal
            ? {
                level: countryPage.legal_model.signals?.enforcement_level || null,
                recreational: countryPage.legal_model.recreational.enforcement
              }
            : null,
          medical: countryPage && includeLegal
            ? {
                status: countryPage.legal_model.medical.status,
                scope: countryPage.legal_model.medical.scope
              }
            : null,
          social: casual ? null : social,
        airports: {
          summary: null
        },
        culture,
        compare: comparePage
          ? {
              geoHint: comparePage.geo_code || null,
              name: comparePage.name || null,
              recreational: comparePage.legal_model.recreational.status,
              medical: comparePage.legal_model.medical.status,
              finalRisk: comparePage.legal_model.signals?.final_risk || null,
              notes: comparePage.notes_normalized || null
            }
          : null,
        nearby: null,
        memory: [],
        history,
        sources: []
      })
    },
    culture,
    compare: comparePage
      ? {
          geoHint: comparePage.geo_code || null,
          name: comparePage.name || null,
          recreational: comparePage.legal_model.recreational.status,
          medical: comparePage.legal_model.medical.status,
          finalRisk: comparePage.legal_model.signals?.final_risk || null,
          notes: comparePage.notes_normalized || null
        }
      : null,
    nearby: nearby
      ? {
          warning: nearby.warning,
          results: [
            ...(nearby.current ? [nearby.current] : []),
            ...nearby.nearby
          ].map((item) => ({
            country: item.country,
            geo: item.geo,
            distanceKm: item.distance_km,
            effectiveDistanceKm: item.effective_distance_km,
            accessType: item.access.type,
            truthScore: item.access.truthScore,
            explanation: item.access.explanation,
            whyThisResult: item.why_this_result,
            destinationRisk: item.risk.destination,
            pathRisk: item.risk.path
          }))
        }
      : null,
    memory: memoryItems,
    history,
    sources: Array.from(
      new Set([
        ...(includeLegal ? countryPage?.legal_model.signals?.sources?.map((item) => item.url || item.title) || [] : []),
        ...(comparePage?.legal_model.signals?.sources?.map((item) => item.url || item.title) || []),
        ...(contextChunks.map((chunk) => chunk.source) || [])
      ].filter(Boolean))
    )
  };

  return assistantContext;
}

function composeLead(context: AIContext) {
  const place = context.location.name || context.location.geoHint || "this place";
  const opener = pickOpener(context);
  if (!context.legal) {
    return context.language === "ru"
      ? `${opener} по этому месту у меня сейчас нет точного legal context в SSOT.`
      : `${opener} I do not have exact legal context for ${place} in the current SSOT.`;
  }

  if (context.language === "ru") {
    if (context.legal.resultStatus === "LEGAL") return `${opener} в ${place} каннабис легален по текущим данным.`;
    if (context.legal.resultStatus === "MIXED") return `${opener} в ${place} картина смешанная — это не полный ban, но и не чистый legal market.`;
    if (context.legal.resultStatus === "DECRIM") return `${opener} в ${place} статус мягче полного запрета, но это не то же самое, что полноценный legal market.`;
    if (context.legal.resultStatus === "ILLEGAL") return `${opener} в ${place} каннабис запрещён по текущему SSOT.`;
    return `${opener} по ${place} картина в данных неполная.`;
  }

  if (context.legal.resultStatus === "LEGAL") return `${opener} cannabis is legal in ${place} in the current SSOT.`;
  if (context.legal.resultStatus === "MIXED") return `${opener} ${place} is mixed in the current SSOT, so parts of the picture are softer while other parts stay restricted.`;
  if (context.legal.resultStatus === "DECRIM") return `${opener} ${place} is softer than a full ban, but that is not the same as a fully legal market.`;
  if (context.legal.resultStatus === "ILLEGAL") return `${opener} cannabis is illegal in ${place} in the current SSOT.`;
  return `${opener} the data for ${place} is still thin.`;
}

function composeLegalDetail(context: AIContext) {
  if (!context.legal || !context.notes) return null;
  if (context.language === "ru") {
    const lines = [];
    if (context.legal.prison) {
      lines.push("Это важно понимать: в данных есть prison exposure, так что это не выглядит как формальный запрет без последствий.");
    } else if (context.legal.arrest) {
      lines.push("Тут есть нюанс: в данных есть arrest risk, даже если на практике всё иногда выглядит мягче.");
    }
    if (context.enforcement?.level === "unenforced" || context.enforcement?.level === "rare") {
      lines.push("При этом enforcement в notes выглядит слабее: есть сигналы про rare convictions или unenforced practice.");
    }
    lines.push(context.notes);
    return lines.join(" ");
  }

  const lines = [];
  if (context.legal.prison) {
    lines.push("Prison exposure is present in the data, so this does not read like a paper-only ban.");
  } else if (context.legal.arrest) {
    lines.push("Arrest risk is present in the data, even if local practice can look softer.");
  }
  if (context.enforcement?.level === "unenforced" || context.enforcement?.level === "rare") {
    lines.push("At the same time, enforcement signals are softer, with rare-conviction or unenforced notes.");
  }
  lines.push(context.notes);
  return lines.join(" ");
}

function composeTravelDetail(context: AIContext) {
  const airportSummary = context.airports?.summary;
  if (!airportSummary) return null;
  if (context.language === "ru") {
    return `Особенно аккуратно с перелётами и границей: ${airportSummary}`;
  }
  return `Be especially careful with flights and borders: ${airportSummary}`;
}

function composeCasualReply(context: AIContext) {
  if (context.language === "ru") {
    return "Спокойно, на связи. Давай разберём, что тебе реально важно понять.";
  }
  return "All calm here. Let’s look at what you actually want to understand.";
}

function composeSocialDetail(context: AIContext) {
  if (!context.social?.summary) return null;
  if (context.language === "ru") {
    return `На земле это может ощущаться иначе: ${context.social.summary} Это не разрешение, а просто social reality из текущих данных.`;
  }
  return `Reality on the ground can feel different: ${context.social.summary} That is not permission, only the current social signal.`;
}

function composeMedicalDetail(context: AIContext) {
  if (!context.medical?.status) return null;
  if (context.intent !== "medical" && context.intent !== "general" && context.intent !== "legal") return null;
  if (context.language === "ru") {
    return context.medical.status === "LEGAL" || context.medical.status === "LIMITED"
      ? `Если смотреть именно на medical side: доступ там ${context.medical.status.toLowerCase()}.`
      : "Если вопрос именно про medical access: по текущим данным он не открыт как обычный legal channel.";
  }
  return context.medical.status === "LEGAL" || context.medical.status === "LIMITED"
    ? `On the medical side, access is ${context.medical.status.toLowerCase()} in the current data.`
    : "On the medical side, the current data does not show an open legal channel.";
}

function composeCultureDetail(context: AIContext) {
  if (!context.culture.length) return null;
  const chunk = context.culture[0];
  if (context.language === "ru") {
    return `${chunk.title}: ${chunk.text}`;
  }
  return `${chunk.title}: ${chunk.text}`;
}

function composeFollowUp(context: AIContext) {
  if (context.language === "ru") {
    if (context.intent === "airport") return "Показать, где самые строгие аэропорты?";
    if (context.intent === "culture") return "Разобрать глубже?";
    return "Хочешь сравнить с другой страной?";
  }
  if (context.intent === "airport") return "Want me to show the strictest airports too?";
  if (context.intent === "culture") return "Want to go deeper?";
  return "Want to compare it with another country?";
}

function normalizedWords(text: string) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .split(/\s+/)
      .filter(Boolean)
  );
}

function isRepeatAnswer(nextAnswer: string, lastAnswer: string | null | undefined) {
  if (!lastAnswer) return false;
  const left = normalizedWords(nextAnswer);
  const right = normalizedWords(lastAnswer);
  if (!left.size || !right.size) return false;
  let overlap = 0;
  for (const word of left) {
    if (right.has(word)) overlap += 1;
  }
  return overlap / Math.max(left.size, right.size) > 0.8;
}

function needsCultureRetry(context: AIContext, answer: string) {
  if (context.intent !== "culture") return false;
  const lower = String(answer || "").toLowerCase();
  if (isGlobalCultureQuery(context.query)) {
    if (/420/.test(context.query) && !/420|april 20|april twentieth|waldos/.test(lower)) return true;
    if (/reggae|marley|rastafari/i.test(context.query) && !/reggae|bob marley|peter tosh|bunny wailer|rastafari/.test(lower)) return true;
    if (/airport|import|make love not war/i.test(context.query) && !/airport|import|border|customs|make love not war|anti-war|counterculture/.test(lower)) {
      return true;
    }
  }
  return /\billegal\b|\blegal\b|\bdistribution\b|\bmedical\b|\bdecriminalized\b|\brisk\b|\bprison\b|\benforcement\b/.test(lower);
}

function needsCompareRetry(context: AIContext, answer: string) {
  if (!context.compare?.name) return false;
  if (!/compare|safer|tourist|tourists|best advice|which/i.test(context.query)) return false;
  const lower = String(answer || "").toLowerCase();
  const current = String(context.location.name || context.location.geoHint || "").toLowerCase();
  const compare = String(context.compare.name || "").toLowerCase();
  return !lower.includes(current) || !lower.includes(compare);
}

function needsTouristRetry(context: AIContext, answer: string) {
  if (context.intent !== "tourists" && !/tourist|tourists/i.test(context.query)) return false;
  return !/tourist|travel|visitor|airport|border/i.test(String(answer || "").toLowerCase());
}

function needsCompanionStyleRetry(answer: string) {
  return /\bi am an ai\b|\bas an ai\b|\blanguage model\b|\bi cannot access current laws\b|\bi can'?t access current laws\b/i.test(
    String(answer || "")
  );
}

function findUnexpectedJurisdiction(context: AIContext, answer: string) {
  const lowerAnswer = String(answer || "").toLowerCase();
  const allowed = new Set(
    [context.location.geoHint, context.compare?.geoHint]
      .map((item) => String(item || "").toUpperCase())
      .filter(Boolean)
  );
  for (const entry of getJurisdictionAliases()) {
    if (!hasAlias(lowerAnswer, entry.alias)) continue;
    if (allowed.has(entry.geo)) continue;
    return entry.geo;
  }
  return null;
}

function needsLocationRetry(context: AIContext, answer: string) {
  const primaryName = String(context.location.name || context.location.geoHint || "").toLowerCase();
  if (!primaryName) return false;
  const lowerAnswer = String(answer || "").toLowerCase();
  if (!lowerAnswer.includes(primaryName)) return true;
  if (context.compare?.name && /compare|safer|than|versus|vs\.?|difference|tourist|travel/i.test(context.query)) {
    if (!lowerAnswer.includes(String(context.compare.name).toLowerCase())) return true;
  }
  return Boolean(findUnexpectedJurisdiction(context, answer));
}

function buildLocationRetryInstruction(context: AIContext) {
  const primary = context.location.name || context.location.geoHint || "the selected location";
  if (context.compare?.name) {
    return `Retry rule: You are currently discussing ${primary}. Compare ONLY these countries: ${primary} and ${context.compare.name}. Do not introduce any other country. If you mention a place outside this pair, the answer is wrong. Continue the same dialogue and answer the latest question directly.`;
  }
  return `Retry rule: You are currently discussing ${primary}. You MUST stay strictly within ${primary} unless the user explicitly changes location. Do not introduce any other country. Continue the same dialogue and answer the latest question directly.`;
}

export function needsCompanionRetry(context: AIContext, answer: string) {
  return (
    needsCultureRetry(context, answer) ||
    needsCompareRetry(context, answer) ||
    needsTouristRetry(context, answer) ||
    needsCompanionStyleRetry(answer) ||
    needsLocationRetry(context, answer)
  );
}

export function buildCompanionRetryInstruction(context: AIContext) {
  if (context.intent === "culture") {
    return "Retry rule: answer only from the culture fact lines, do not mention legal status, risk, prison, distribution, or medical access unless the user explicitly asked for law.";
  }
  return buildLocationRetryInstruction(context);
}

function dedupeBlocks(blocks: Array<string | null>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const block of blocks) {
    const normalized = String(block || "").trim();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function pickOpener(context: AIContext) {
  const pool = context.language === "ru" ? RU_OPENERS : EN_OPENERS;
  const seed = `${context.query}|${context.intent}|${context.location.geoHint || ""}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return pool[hash % pool.length];
}

function rewriteRepeatedAnswer(context: AIContext, answer: string) {
  const opener = context.language === "ru" ? "С другой стороны, важный момент:" : "From another angle, what matters is this:";
  return `${opener}\n\n${answer}`;
}

function ensureNonEmptyAnswer(context: AIContext, answer: string) {
  const text = String(answer || "").trim();
  if (text.length >= 20) return text;
  if (!text || text.length < 20) {
    return fallbackHumanized(context.location.name || context.location.geoHint, context.intent, context.language);
  }
  const prefix =
    context.language === "ru"
      ? "Давай разверну чуть подробнее:\n\n"
      : "Let me open that up a little more:\n\n";
  return `${prefix}${text || generateGeneral(context)}`;
}

function needsShortAnswerRetry(answer: string) {
  return String(answer || "").trim().length < 60;
}

export function normalizeAnswer(text: string) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  return normalized.length >= 40 ? normalized : null;
}

export function needsOutputRetry(context: AIContext, answer: string | null) {
  if (!answer) return true;
  return needsShortAnswerRetry(answer) || needsCompanionRetry(context, answer);
}

export function buildDeterministicRetryInstruction(context: AIContext) {
  const location = context.location.name || context.location.geoHint || "this location";
  if (context.compare?.name) {
    return `Answer again clearly about ${location} and ${context.compare.name}. Be specific. Name both places directly.`;
  }
  return `Answer again clearly about ${location}. Be specific.`;
}

function continueLastTopic(context: AIContext) {
  const activeIntent = context.history.lastIntent || context.intent;
  if (activeIntent === "nearby") {
    return generateNearby({ ...context, intent: "nearby" });
  }
  if (context.language === "ru") {
    const blocks = dedupeBlocks([
      activeIntent === "airport"
        ? "Если копнуть глубже, главный риск здесь всё равно связан с перелётами и границей."
        : context.history.lastAnswer
          ? "Есть ещё момент, который важно понимать:"
          : "Если копнуть глубже:",
      activeIntent === "culture" ? composeCultureDetail(context) : composeSocialDetail(context),
      activeIntent !== "culture" ? composeTravelDetail(context) : null,
      composeMedicalDetail(context),
      "Если интересно, можно сравнить это с другой страной или штатом."
    ]);
    return blocks.join("\n\n");
  }
  const blocks = dedupeBlocks([
    activeIntent === "airport"
      ? "If we go one layer deeper, the biggest risk still sits around flights and border control."
      : context.history.lastAnswer
        ? "There is another angle here that matters:"
        : "If we go one layer deeper:",
    activeIntent === "culture" ? composeCultureDetail(context) : composeSocialDetail(context),
    activeIntent !== "culture" ? composeTravelDetail(context) : null,
    composeMedicalDetail(context),
    "If you want, we can compare this with another country or state."
  ]);
  return blocks.join("\n\n");
}

function generateLegal(context: AIContext) {
  return dedupeBlocks([
    composeLead(context),
    composeLegalDetail(context),
    composeSocialDetail(context),
    composeMedicalDetail(context),
    composeFollowUp(context)
  ]).join("\n\n");
}

function generateTravel(context: AIContext) {
  return dedupeBlocks([
    composeLead(context),
    composeTravelDetail(context),
    composeLegalDetail(context),
    composeSocialDetail(context),
    composeFollowUp(context)
  ]).join("\n\n");
}

function generateCulture(context: AIContext) {
  return dedupeBlocks([
    context.language === "ru"
      ? `Если смотреть не только на закон, а на ощущение на месте в ${context.location.name || "этой стране"}:`
      : `If we look at more than the law in ${context.location.name || "that place"}:`,
    composeCultureDetail(context),
    composeSocialDetail(context),
    composeFollowUp(context)
  ]).join("\n\n");
}

function generateGlobalCulture(context: AIContext) {
  const query = String(context.query || "").toLowerCase();
  if (/420/.test(query)) {
    if (/legal|law|here|change anything|change/.test(query)) {
      const place = context.location.name || context.location.geoHint || "this place";
      return [
        `${place}: 420 culture does not change the legal situation.`,
        "420 is cannabis slang and a cultural symbol, not a legal permission or a protected category.",
        "So even if people recognize the reference, the practical answer still comes from local cannabis law, enforcement, and how public behavior is treated on the ground."
      ].join("\n\n");
    }
    return [
      "420 is cannabis slang, not a legal category.",
      "The usual origin story points to a California high-school group called the Waldos, who used 4:20 as a meetup code.",
      "From there it spread into wider cannabis culture and turned April 20 into a symbolic day for gatherings, activism, and celebration."
    ].join("\n\n");
  }
  if (/reggae|marley|rastafari/.test(query)) {
    return [
      "The clearest reggae-linked cannabis figures are Bob Marley, Peter Tosh, and Bunny Wailer.",
      "That link comes less from celebrity branding and more from Rastafari culture, where ganja was treated as part of spiritual and countercultural practice.",
      "Snoop Dogg belongs in cannabis celebrity culture too, but he is more hip-hop than reggae."
    ].join("\n\n");
  }
  if (/airport|import|make love not war/.test(query)) {
    return [
      "For airports, the honest answer is that legal cannabis import is basically nowhere as a normal traveler privilege.",
      "Airports do not create their own cannabis legality: customs, border law, and national import rules control that, so crossing a border with cannabis is illegal in most cases even when local use is legal.",
      "\"Make Love Not War\" is a 1960s anti-war counterculture slogan tied to peace activism and the broader hippie era, not a cannabis law rule."
    ].join("\n\n");
  }
  return generateCulture(context);
}

function formatRiskSignal(value: string | null | undefined) {
  return String(value || "unknown")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^the risk is\s+/i, "")
    .trim();
}

function generateProductRisk(context: AIContext) {
  const place = context.location.name || context.location.geoHint || "this place";
  const risk = formatRiskSignal(context.legal?.finalRisk);
  const recreational = String(context.legal?.recreational || "unknown").toLowerCase().replaceAll("_", " ");
  const distribution = String(context.legal?.distribution || "unknown").toLowerCase().replaceAll("_", " ");
  const medical = String(context.legal?.medical || "unknown").toLowerCase().replaceAll("_", " ");
  return [
    `${place}: CBD-like products are not automatically safe just because they sound softer than cannabis flower.`,
    `The legal backdrop is still ${recreational} recreationally, ${medical} medically, and ${distribution} on distribution, with a ${risk} practical risk signal.`,
    "The real problem is product ambiguity: police, customs, or airport screening may treat flower, oils, gummies, or vapes as cannabis-linked products first and sort out the chemistry later.",
    "For a cautious traveler or buyer, assume risk stays real unless the product is clearly lawful in that jurisdiction and you are not crossing a border with it."
  ].join("\n\n");
}

function generateSmallAmountRisk(context: AIContext) {
  const place = context.location.name || context.location.geoHint || "this place";
  const risk = formatRiskSignal(context.legal?.finalRisk || "high");
  const recreational = String(context.legal?.recreational || "illegal").toLowerCase().replaceAll("_", " ");
  const prison = Boolean(context.legal?.prison);
  const arrest = Boolean(context.legal?.arrest);
  return [
    `${place}: even a tiny amount should be treated as a serious situation, not a harmless technicality.`,
    `The legal backdrop is still ${recreational}, and the practical risk signal reads ${risk}.`,
    prison
      ? "Prison exposure exists in the underlying data, so a 'small amount' does not automatically make this low-stakes."
      : arrest
        ? "Arrest exposure exists in the underlying data, so a 'small amount' can still trigger real trouble."
        : "Enforcement can still bite before anyone cares how small the amount looked.",
    "The honest bottom line is simple: do not assume discretion, sympathy, or a personal-use story will protect you."
  ].join("\n\n");
}

function generateTraceRisk(context: AIContext) {
  const place = context.location.name || context.location.geoHint || "this place";
  const risk = formatRiskSignal(context.legal?.finalRisk);
  const prison = Boolean(context.legal?.prison);
  const arrest = Boolean(context.legal?.arrest);
  const query = String(context.query || "").toLowerCase();
  const smellCase = /smell like weed|smell of weed|only smell like|just smell like|smell after a party/.test(query);
  const grinderCase = /grinder|residue|pouch/.test(query);
  const lead = smellCase
    ? `${place}: the smell alone can still become a problem because it gives police or security a reason to start paying attention.`
    : grinderCase
      ? `${place}: a grinder or pouch with residue is more than a harmless leftover because it can be treated as physical drug evidence.`
      : `${place}: trace signs like smell or residue can still create real exposure even when the amount looks trivial.`;
  const escalation = smellCase
    ? `What matters most is that smell can trigger questioning, searches, or extra scrutiny, and the practical risk signal here is ${risk}.`
    : grinderCase
      ? `What matters most is that residue gives police or airport staff something concrete to point at, and the practical risk signal here is ${risk}.`
      : `What matters most is that trace evidence gives police or airport staff a concrete reason to escalate the encounter, and the practical risk signal here is ${risk}.`;
  return [
    lead,
    escalation,
    prison
      ? "Because prison exposure exists in the underlying data, it is not smart to treat trace evidence as harmless."
      : arrest
        ? "Because arrest exposure exists in the underlying data, trace evidence can still turn into a real enforcement problem."
        : "Even without a large quantity, trace evidence can still trigger searches, questioning, or extra scrutiny.",
    "The safest reading is simple: do not assume that 'it is only residue' or 'it is only the smell' will calm the situation down."
  ].join("\n\n");
}

function generateTravelRiskAnswer(context: AIContext) {
  const place = context.location.name || context.location.geoHint || "this place";
  const query = String(context.query || "").toLowerCase();
  const airport = /airport|screening|bag|luggage|customs/.test(query);
  const prescription = /prescription|medical document/.test(query);
  const tourist = /tourist|visitor|public|asking where to find weed/.test(query);
  const risk = formatRiskSignal(context.legal?.finalRisk);
  const lines = [];
  if (tourist) {
    lines.push(`${place}: a careless tourist can create a real problem because public attention is often what turns a quiet situation into an enforcement situation.`);
    lines.push(`What matters is not just the written law but the fact that public behavior gives police or security a reason to step in, and the practical risk signal here is ${risk}.`);
  }
  if (prescription) {
    lines.push(`A foreign medical prescription does not automatically protect you on the ground in ${place}.`);
    lines.push(context.medical?.status === "LEGAL" || context.medical?.status === "LIMITED"
      ? "It may help explain context, but it does not override local rules, border rules, or officer discretion."
      : "If the local medical channel is not openly recognized, foreign paperwork should not be treated as a safe shield.");
  }
  if (airport) {
    lines.push(`Airport and customs risk should be treated seriously in ${place}, especially if something cannabis-related is forgotten in a bag.`);
    lines.push("The problem is simple: screening turns a private mistake into a border or security issue very quickly.");
  }
  lines.push("The calm bottom line is: do not rely on being a tourist, on good intentions, or on paperwork to make cannabis-related risk disappear.");
  return lines.join("\n\n");
}

function generateGeneral(context: AIContext) {
  if (isCasualQuery(context.query)) {
    return dedupeBlocks([
      composeCasualReply(context),
      composeFollowUp(context)
    ]).join("\n\n");
  }
  return dedupeBlocks([
    composeLead(context),
    context.intent === "airport" || context.intent === "tourists" ? composeTravelDetail(context) : null,
    composeLegalDetail(context),
    composeSocialDetail(context),
    composeMedicalDetail(context),
    composeFollowUp(context)
  ]).join("\n\n");
}

function generateComparison(context: AIContext) {
  const current = context.location.name || context.location.geoHint || "the current place";
  const compare = context.compare?.name || "the comparison place";
  const currentStatus = context.legal?.resultStatus ? String(context.legal.resultStatus).toLowerCase().replaceAll("_", " ") : "unknown";
  const currentRisk = formatRiskSignal(context.legal?.finalRisk);
  const compareRisk = formatRiskSignal(context.compare?.finalRisk);
  const compareStatus =
    context.compare?.recreational === "LEGAL"
      ? "legal"
      : context.compare?.recreational === "DECRIM"
        ? "decriminalized"
        : context.compare?.medical === "LEGAL" || context.compare?.medical === "LIMITED"
          ? "mixed"
          : compareRisk;
  const safer =
    /high/.test(currentRisk) && !/high/.test(compareRisk)
      ? compare
      : /high/.test(compareRisk) && !/high/.test(currentRisk)
        ? current
        : compare;
  return [
    `${current} and ${compare} are not the same situation.`,
    `${current}: overall status is ${currentStatus}, with a ${currentRisk} risk signal.`,
    `${compare}: overall status is ${compareStatus}, with a ${compareRisk} risk signal.`,
    `If the question is which is safer, ${safer} looks safer in practical terms, but travel or border movement with cannabis is still a bad idea.`
  ].join("\n\n");
}

export function generateAnswer(context: AIContext): string {
  const continuation = isContinuationQuery(context.query) && Boolean(context.history.lastIntent);
  if (context.intent === "nearby") {
    return applyDialogStyle(ensureNonEmptyAnswer(context, generateNearby(context)), context.intent, context.language);
  }
  if (context.compare?.name && /compare|safer|why/i.test(context.query)) {
    return applyDialogStyle(ensureNonEmptyAnswer(context, generateComparison(context)), context.intent, context.language);
  }
  if (isBasicLawQuery(context.query)) {
    return applyDialogStyle(ensureNonEmptyAnswer(context, generateLegal(context)), "legal", context.language);
  }
  if (isTravelRiskQuery(context.query)) {
    return applyDialogStyle(ensureNonEmptyAnswer(context, generateTravelRiskAnswer(context)), context.intent, context.language);
  }
  if (isTraceRiskQuery(context.query)) {
    return applyDialogStyle(ensureNonEmptyAnswer(context, generateTraceRisk(context)), context.intent, context.language);
  }
  if (isSmallAmountRiskQuery(context.query)) {
    return applyDialogStyle(ensureNonEmptyAnswer(context, generateSmallAmountRisk(context)), context.intent, context.language);
  }
  if (isProductRiskQuery(context.query)) {
    return applyDialogStyle(ensureNonEmptyAnswer(context, generateProductRisk(context)), context.intent, context.language);
  }
  if (isGlobalCultureQuery(context.query)) {
    return applyDialogStyle(ensureNonEmptyAnswer(context, generateGlobalCulture(context)), "culture", context.language);
  }
  if (continuation) {
    return applyDialogStyle(ensureNonEmptyAnswer(context, continueLastTopic(context)), context.intent, context.language);
  }
  const answer =
    continuation
      ? continueLastTopic(context)
    : context.intent === "legal" || context.intent === "buy" || context.intent === "possession" || context.intent === "medical"
      ? generateLegal(context)
      : context.intent === "airport" || context.intent === "tourists"
        ? generateTravel(context)
      : context.intent === "culture"
          ? generateCulture(context)
          : generateGeneral(context);
  if (isRepeatAnswer(answer, context.history.lastAnswer)) {
    return applyDialogStyle(
      ensureNonEmptyAnswer(context, rewriteRepeatedAnswer(context, answer)),
      context.intent,
      context.language
    );
  }
  return applyDialogStyle(ensureNonEmptyAnswer(context, answer), context.intent, context.language);
}

function generateNearby(context: AIContext) {
  if (!context.nearby?.results?.length) {
    return context.language === "ru"
      ? "Рядом я пока не вижу честных nearby-вариантов по текущим данным. Это не значит, что вариантов нет, а значит, что текущий truth-layer их не подтверждает."
      : "I do not see any honest nearby options in the current data yet. That does not prove there are none, only that this truth layer does not confirm them.";
  }
  const top = context.nearby.results.slice(0, 3);
  if (context.language === "ru") {
    const intro = context.location.name
      ? `Если смотреть от ${context.location.name}, ближе всего сейчас выглядят такие варианты:`
      : "Если смотреть от твоей текущей точки, ближе всего сейчас выглядят такие варианты:";
    const lines = top.map((item) => {
      const access =
        item.accessType === "legal" ? "легально" :
        item.accessType === "mostly_allowed" ? "в основном разрешено" :
        item.accessType === "limited" ? "ограничено" :
        item.accessType === "tolerated" ? "терпимо на практике" :
        "строго";
      return `• ${item.country} — около ${Math.round(item.distanceKm)} км, ${access}. ${item.explanation}`;
    });
    return [intro, ...lines, context.nearby.warning].join("\n");
  }
  const intro = context.location.name
    ? `If we start from ${context.location.name}, the closest honest options right now look like this:`
    : "If we start from your current point, the closest honest options right now look like this:";
  const lines = top.map((item) =>
    `• ${item.country} — about ${Math.round(item.distanceKm)} km away, ${item.accessType.replaceAll("_", " ")}. ${item.explanation}`
  );
  return [intro, ...lines, context.nearby.warning].join("\n");
}

function injectDonation(answer: string) {
  if (donationShown) return answer;
  donationShown = true;
  return `${answer}\n\nIf this helped you, you can send a small thanks (1 USD).`;
}

function isCpuSaturated() {
  const cores = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length || 1;
  const ratio = os.loadavg()[0] / Math.max(cores, 1);
  return ratio >= MAX_CPU_LOAD_RATIO;
}

export async function verifyAssistantLlmConnection(overrideModels?: string[]) {
  return verifyProviderConnection(overrideModels);
}

export async function warmAssistantModel(overrideModels?: string[]) {
  return warmProviderModel(overrideModels);
}

export async function answerWithAssistant(
  query: string,
  geoHint: string | undefined,
  coords: { lat?: number | null; lng?: number | null } | undefined,
  contextChunks: RagChunk[],
  language: string | undefined,
  overrideModels?: string[]
): Promise<AIResponse> {
  const initialContext = buildContext(query, geoHint, coords, contextChunks, language);
  const memoryMatches = retrieveMemory(
    query,
    initialContext.intent,
    initialContext.location.geoHint || undefined,
    initialContext.history.lastLocation || initialContext.location.geoHint || undefined
  ).map((item) => ({
    query: item.query,
    answer: item.answer,
      score: item.score
    }));
  const context = buildContext(query, geoHint, coords, contextChunks, language, memoryMatches);
  if (context.compare?.name && /compare|safer|why/i.test(query)) {
    const answer = generateAnswer(context);
    rememberDialog(context, answer);
    if (answer.length > 60) {
      saveMemory({
        query,
        intent: context.intent,
        location: context.location.geoHint || undefined,
        answer,
        score: scoreMemory(answer, Boolean(context.history.lastIntent), Boolean(memoryMatches.length))
      });
    }
    return {
      answer,
      sources: context.sources,
      safety_note: context.language === "ru" ? "Не юридическая консультация." : "Not legal advice.",
      model: "compare-engine",
      llm_connected: false
    };
  }
  if (isBasicLawQuery(query)) {
    const answer = generateAnswer(context);
    rememberDialog(context, answer);
    if (answer.length > 60) {
      saveMemory({
        query,
        intent: context.intent,
        location: context.location.geoHint || undefined,
        answer,
        score: scoreMemory(answer, Boolean(context.history.lastIntent), Boolean(memoryMatches.length))
      });
    }
    return {
      answer,
      sources: context.sources,
      safety_note: context.language === "ru" ? "Не юридическая консультация." : "Not legal advice.",
      model: "truth-engine",
      llm_connected: false
    };
  }
  if (isTravelRiskQuery(query)) {
    const answer = generateAnswer(context);
    rememberDialog(context, answer);
    if (answer.length > 60) {
      saveMemory({
        query,
        intent: context.intent,
        location: context.location.geoHint || undefined,
        answer,
        score: scoreMemory(answer, Boolean(context.history.lastIntent), Boolean(memoryMatches.length))
      });
    }
    return {
      answer,
      sources: context.sources,
      safety_note: context.language === "ru" ? "Не юридическая консультация." : "Not legal advice.",
      model: "travel-risk-engine",
      llm_connected: false
    };
  }
  if (isTraceRiskQuery(query)) {
    const answer = generateAnswer(context);
    rememberDialog(context, answer);
    if (answer.length > 60) {
      saveMemory({
        query,
        intent: context.intent,
        location: context.location.geoHint || undefined,
        answer,
        score: scoreMemory(answer, Boolean(context.history.lastIntent), Boolean(memoryMatches.length))
      });
    }
    return {
      answer,
      sources: context.sources,
      safety_note: context.language === "ru" ? "Не юридическая консультация." : "Not legal advice.",
      model: "trace-risk-engine",
      llm_connected: false
    };
  }
  if (!context.compare?.name && isProductRiskQuery(query)) {
    const answer = generateAnswer(context);
    rememberDialog(context, answer);
    if (answer.length > 60) {
      saveMemory({
        query,
        intent: context.intent,
        location: context.location.geoHint || undefined,
        answer,
        score: scoreMemory(answer, Boolean(context.history.lastIntent), Boolean(memoryMatches.length))
      });
    }
    return {
      answer,
      sources: context.sources,
      safety_note: context.language === "ru" ? "Не юридическая консультация." : "Not legal advice.",
      model: "product-risk-engine",
      llm_connected: false
    };
  }
  if (isSmallAmountRiskQuery(query)) {
    const answer = generateAnswer(context);
    rememberDialog(context, answer);
    if (answer.length > 60) {
      saveMemory({
        query,
        intent: context.intent,
        location: context.location.geoHint || undefined,
        answer,
        score: scoreMemory(answer, Boolean(context.history.lastIntent), Boolean(memoryMatches.length))
      });
    }
    return {
      answer,
      sources: context.sources,
      safety_note: context.language === "ru" ? "Не юридическая консультация." : "Not legal advice.",
      model: "risk-engine",
      llm_connected: false
    };
  }
  if (isGlobalCultureQuery(query)) {
    const answer = generateAnswer(context);
    rememberDialog(context, answer);
    if (answer.length > 60) {
      saveMemory({
        query,
        intent: context.intent,
        location: context.location.geoHint || undefined,
        answer,
        score: scoreMemory(answer, Boolean(context.history.lastIntent), Boolean(memoryMatches.length))
      });
    }
    return {
      answer,
      sources: context.sources,
      safety_note: context.language === "ru" ? "Не юридическая консультация." : "Not legal advice.",
      model: "culture-engine",
      llm_connected: false
    };
  }
  if (shouldUseNearbyTruth(query, context)) {
    const nearbyContext = { ...context, intent: "nearby" as const };
    const answer = generateAnswer(nearbyContext);
    rememberDialog(nearbyContext, answer);
    if (answer.length > 60) {
      saveMemory({
        query,
        intent: nearbyContext.intent,
        location: nearbyContext.location.geoHint || undefined,
        answer,
        score: scoreMemory(answer, Boolean(nearbyContext.history.lastIntent), Boolean(memoryMatches.length))
      });
    }
    return {
      answer,
      sources: context.sources,
      safety_note: context.language === "ru" ? "Не юридическая консультация." : "Not legal advice.",
      model: "truth-engine",
      llm_connected: false
    };
  }
  const messages = buildMessages({ query, context });
  const provider = resolveAIProvider();
  if (provider === "ollama" && Date.now() < ollamaCooldownUntil) {
    throw new AIConnectionError("LLM_COOLDOWN", "Local Ollama model is cooling down after a failed run.", 503);
  }
  if (provider === "ollama" && isCpuSaturated()) {
    throw new AIConnectionError("LLM_CPU_GUARD", "Local Ollama runner is saturated.", 503);
  }
  if (provider === "ollama" && ollamaInferenceRunning) {
    throw new AIConnectionError("LLM_BUSY", "Local Ollama runner is busy with another request.", 503);
  }
  if (provider === "ollama") {
    ollamaInferenceRunning = true;
  }
  try {
    const llm = await verifyAssistantLlmConnection(overrideModels);
    let answer: string;
    let usedModel = llm.model;
    try {
      const result = await generateWithProvider(messages, { overrideModels });
      answer = result.text;
      usedModel = result.model;
    } catch (error) {
      if (provider === "ollama") {
        ollamaCooldownUntil = Date.now() + OLLAMA_COOLDOWN_MS;
      }
      throw error;
    }

    if (isRepeatAnswer(answer, context.history.lastAnswer)) {
      const memoryCandidate = memoryMatches.find((item) => item.answer.trim() !== String(context.history.lastAnswer || "").trim());
      if (memoryCandidate) {
        answer = memoryCandidate.answer;
      } else {
        const retryMessages: LlmMessage[] = [
          ...messages,
          {
            role: "user",
            content:
              "Retry rule: rewrite with a new angle, stay on the same place and topic, keep it concise, and do not repeat any sentence from your previous answer."
          }
        ];
        const retryResult = await generateWithProvider(retryMessages, { overrideModels: [usedModel] });
        answer = retryResult.text;
      }
    }

    let normalizedAnswer = normalizeAnswer(answer);
    if (needsOutputRetry(context, normalizedAnswer)) {
      const retryMessages: LlmMessage[] = [
        ...messages,
        {
          role: "user",
          content: buildDeterministicRetryInstruction(context)
        }
      ];
      const retryResult = await generateWithProvider(retryMessages, { overrideModels: [usedModel] });
      normalizedAnswer = normalizeAnswer(retryResult.text);
    }
    answer =
      normalizedAnswer && !needsOutputRetry(context, normalizedAnswer)
        ? normalizedAnswer
        : generateAnswer(context);
    rememberDialog(context, answer);
    if (answer.length > 60) {
      saveMemory({
        query,
        intent: context.intent,
        location: context.location.geoHint || undefined,
        answer,
        score: scoreMemory(answer, Boolean(context.history.lastIntent), Boolean(memoryMatches.length))
      });
    }
    return {
      answer: injectDonation(answer),
      sources: context.sources,
      safety_note: context.language === "ru" ? "Не юридическая консультация." : "Not legal advice.",
      model: usedModel,
      llm_connected: true
    };
  } finally {
    if (provider === "ollama") {
      ollamaInferenceRunning = false;
    }
  }
}
