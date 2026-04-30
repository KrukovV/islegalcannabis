import socialRealityData from "../../../../data/generated/socialReality.global.json";
import { getCountryPageIndexByGeoCode, getCountryPageIndexByIso2 } from "@/lib/countryPageStorage";
import { findNearbyTruth } from "@/lib/geo/nearbyTruth";
import { deriveResultStatusFromCountryPageData } from "@/lib/resultStatus";
import { buildMessages, type LlmMessage } from "./prompt";
import type { AIContext, AIResponse, RagChunk } from "./types";
import { classifyIntent, detectIntent, getDialogState, isBasicLawQuery, isContinuationQuery, isCultureFollowupQuery, isGlobalCultureQuery, isMarketAccessQuery, isNearSearch, isProductRiskQuery, isSmallAmountRiskQuery, isTraceRiskQuery, isTravelRiskQuery, rememberDialog } from "./dialog";
import { getTravelRiskBlock } from "./rag";
import { retrieveMemory, saveMemory, scoreMemory } from "./memory";
import { applyDialogStyle, fallbackHumanized } from "./dialogStyle";
import { detectType } from "./slang";
import { applyTone, buildIntro } from "./tone";
import { buildReaction } from "./reaction";
import {
  AIConnectionError,
  generateWithProvider,
  resolveAIProvider,
  verifyProviderConnection,
  warmProviderModel
} from "./provider";

const OLLAMA_COOLDOWN_MS = 60000;
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
  const geoCodeMatch = countryPageIndexByGeoCodeCache.get(normalized);
  if (geoCodeMatch) return geoCodeMatch;
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
    const commonName = lowerName.split("/")[0]?.trim();
    if (commonName && commonName !== lowerName) aliases.push({ alias: commonName, geo });
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

function isImplicitFollowUpQuery(query: string) {
  return /^(and\b.*|where safer\??|which (?:one )?is safer\??|why\??|why not\??|risks?\??|risk\??)$/i.test(
    String(query || "").trim()
  );
}

function enrichContext(
  query: string,
  routed: ReturnType<typeof classifyIntent>,
  hasFollowUp: boolean
) {
  const context = {
    mode: "default",
    hint: null as string | null,
    disableGeo: false
  };

  if (routed.intent === "SLANG") {
    context.mode = "culture";
    context.hint = "User asks about cannabis slang or culture. Answer briefly, naturally, and do not add legal blocks unless the user explicitly asks about law.";
    context.disableGeo = true;
  } else if (routed.intent === "CHAT") {
    context.mode = "chat";
    context.hint = "Casual conversation. Keep it short, natural, and human.";
    context.disableGeo = true;
  } else if (routed.intent === "UNKNOWN") {
    context.mode = "clarify";
    context.hint = "User input is vague. Ask one short clarifying question.";
    context.disableGeo = true;
  } else if (routed.intent === "LEGAL") {
    context.mode = "legal";
    context.hint = "User asks about cannabis law. Use the provided legal facts, stay in the current place, and answer clearly without drifting to other countries.";
  }

  if (hasFollowUp) {
    context.hint = context.hint ? `${context.hint} This is a follow-up. Stay in context.` : "This is a follow-up. Stay in context.";
  }

  return context;
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
  const hintChanged =
    Boolean(hintedPage && lockedPage && hintedPage.geo_code !== lockedPage.geo_code);
  const implicitFollowUp = Boolean(lockedPage && !mentioned.length && isImplicitFollowUpQuery(query));
  const preferHint =
    Boolean(hintedPage && (!lockedPage || hintChanged)) && !isContinuationQuery(query) && !implicitFollowUp;

  if (mentioned.length) {
    if (comparison && (lockedPage || hintedPage)) {
      const primaryPage = preferHint ? hintedPage : lockedPage || hintedPage;
      const comparePage = mentioned.find((page) => page.geo_code !== primaryPage?.geo_code) || null;
      return {
        primary: primaryPage,
        compare: comparePage,
        source: preferHint ? "ui" as const : lockedPage ? "user" as const : "geo" as const
      };
    }
    return {
      primary: mentioned[0],
      compare: mentioned.find((page) => page.geo_code !== mentioned[0].geo_code) || null,
      source: "user" as const
    };
  }

  if (preferHint) {
    return {
      primary: hintedPage,
      compare: null,
      source: "ui" as const
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
  return /^(hello|how are you|how's it going|hows it going|what's up|whats up|че как|чё как|как дела|как ты|ты как|ты здесь)\??$/i.test(
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
  return Boolean(context.nearby && isNearSearch(query));
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
  const detectedSlang = detectType(query);
  const routedIntent = classifyIntent(query);
  const hasFollowUp =
    Boolean(history.lastIntent) &&
    (isContinuationQuery(query) || isCultureFollowupQuery(query) || isImplicitFollowUpQuery(query));
  const carriedRouterIntent =
    hasFollowUp && history.lastIntent
      ? history.lastIntent === "culture"
        ? "SLANG"
        : history.lastIntent === "nearby"
          ? "GEO"
          : history.lastIntent === "legal" ||
              history.lastIntent === "airport" ||
              history.lastIntent === "tourists" ||
              history.lastIntent === "medical" ||
              history.lastIntent === "buy" ||
              history.lastIntent === "possession"
            ? "LEGAL"
            : routedIntent.intent
      : routedIntent.intent;
  const routedForContext =
    hasFollowUp
      ? { ...routedIntent, intent: carriedRouterIntent }
      : routedIntent;
  const enriched = enrichContext(query, routedForContext, hasFollowUp);
  const slang = history.lastIntent && isContinuationQuery(query) && detectedSlang.type !== "intent"
    ? { ...detectedSlang, type: "unknown" as const }
    : detectedSlang;
  const pipelineQuery = slang.normalized || query;
  const detectedIntent = detectIntent(pipelineQuery);
  const allowGeoContext = !enriched.disableGeo && (routedForContext.intent === "LEGAL" || routedForContext.intent === "GEO");
  const locationSelection =
    !allowGeoContext
      ? {
          primary: null,
          compare: null,
          source: null
        }
      : detectedIntent === "nearby"
      ? {
          primary: getCountryPageForHint(history.lastLocation || geoHint),
          compare: null,
          source: history.lastLocation ? ((history.source || "ui") as "user" | "ui" | "geo") : ("geo" as const)
        }
      : resolveLocationSelection(pipelineQuery, history, geoHint);
  const countryPage = locationSelection.primary;
  const comparePage = locationSelection.compare;
  const effectiveGeoHint = countryPage?.iso2 || countryPage?.geo_code || geoHint;
  const social = getSocialReality(effectiveGeoHint || null);
  const nearbyFollowUp = history.lastIntent === "nearby" && isNearSearch(pipelineQuery);
  const intent =
    nearbyFollowUp
      ? "nearby"
      : detectedIntent === "general" && routedForContext.intent === "LEGAL"
        ? "legal"
        : detectedIntent === "general" && routedForContext.intent === "SLANG"
          ? "culture"
          : detectedIntent;
  const casual = isCasualQuery(query);
  const includeLegal = allowGeoContext && !casual && intent !== "culture";
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
    normalizedQuery: pipelineQuery,
    language: resolvedLanguage,
    forceLanguage: true,
    routerIntent: routedForContext.intent,
    routerHint: enriched.hint,
    disableGeo: enriched.disableGeo,
    tone: slang.tone,
    slangType: slang.type,
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

function composeFollowUp() {
  return null;
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
    if (/420|4\s*20|20\s*апрел/i.test(context.query) && !/waldos|калифор|california|20 апреля|april 20|april twentieth/.test(lower)) return true;
    if (/джоинт|\bjoint\b/i.test(context.query)) {
      if (!/самокрут|косяк|rolled|roll|cannabis|марихуан|каннабис|weed|smoke/.test(lower)) return true;
      if (/сотрудник|руководител|отдел|department|manager|workflow|document|contract|hr\b/.test(lower)) return true;
    }
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

function answerMentionsExpectedLocation(context: AIContext, answer: string) {
  const lower = String(answer || "").toLowerCase();
  const geo = String(context.location.geoHint || "").toUpperCase();
  if (!geo) return false;
  const aliasMatches = getJurisdictionAliases()
    .filter((entry) => entry.geo === geo)
    .map((entry) => entry.alias)
    .filter(Boolean);
  const explicitNames = String(context.location.name || "")
    .split("/")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  for (const alias of [...aliasMatches, ...explicitNames]) {
    if (alias && hasAlias(lower, alias)) return true;
  }
  return false;
}

function needsLegalRetry(context: AIContext, answer: string) {
  const isLegalLikeIntent =
    context.routerIntent === "LEGAL" ||
    context.intent === "legal" ||
    context.intent === "medical" ||
    context.intent === "tourists" ||
    context.intent === "airport" ||
    context.intent === "buy" ||
    context.intent === "possession";
  if (!isLegalLikeIntent) return false;
  return (
    /\bcocaine\w*\b|\bheroin\w*\b|\bopioid\w*\b|кокаин\p{L}*|героин\p{L}*|опиоид\p{L}*/iu.test(String(answer || "")) ||
    !answerMentionsExpectedLocation(context, answer)
  );
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
    needsLegalRetry(context, answer) ||
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
    composeFollowUp()
  ]).join("\n\n");
}

function generateTravel(context: AIContext) {
  return dedupeBlocks([
    composeLead(context),
    composeTravelDetail(context),
    composeLegalDetail(context),
    composeSocialDetail(context),
    composeFollowUp()
  ]).join("\n\n");
}

function generateCulture(context: AIContext) {
  const query = String(context.query || "").toLowerCase().trim();
  const place = context.location.name || context.location.geoHint || "this place";
  if (/^music\??$|^songs?\??$/.test(query)) {
    return [
      `${place}: if you ask simply "music?", I read that as reggae, dub, roots, and cannabis-counterculture music, not a generic playlist.`,
      "Start with Bob Marley, Peter Tosh, Bunny Wailer, Burning Spear, and Lee Scratch Perry; Snoop Dogg fits the wider cannabis-culture lane, but not the reggae/Rastafari core.",
      "The important boundary stays the same: music can explain the mood and symbols, but it does not change local cannabis law or public-use risk."
    ].join("\n\n");
  }
  if (/^films?\??$|^movies?\??$/.test(query)) {
    return [
      `${place}: if you ask simply "films?", I read that as cannabis/reggae-culture films, not random cinema.`,
      "Good directions are reggae/Rastafari documentaries around Bob Marley and Peter Tosh, plus cannabis-counterculture films that show the social side without pretending it changes the law.",
      "The useful boundary is this: a film can explain the mood and symbols, but it does not make possession, buying, public use, or travel safer."
    ].join("\n\n");
  }
  if (/^actors?\??$|^artists?\??$|^performers?\??$/.test(query)) {
    return [
      `${place}: for this topic, "actors" means cannabis-culture figures and reggae/Rastafari-linked artists, not generic movie celebrities.`,
      "The core names are Bob Marley, Peter Tosh, and Bunny Wailer on the reggae/Rastafari side; Snoop Dogg fits cannabis celebrity culture, though more through hip-hop than reggae.",
      "That cultural link is useful for understanding symbols and attitude, but it still stays separate from local law and enforcement."
    ].join("\n\n");
  }
  if (/^(and\??|why\??|more\??|what else\??)$/.test(query)) {
    return [
      `${place}: the extra point is that cannabis culture and cannabis legality move on different tracks.`,
      "Reggae, Rastafari language, 420 references, and weed films can make the topic feel familiar or even normalized, but they do not create legal permission.",
      "So the smart reading is cultural curiosity on one side, and local law, public behavior, and travel risk on the other."
    ].join("\n\n");
  }
  return dedupeBlocks([
    context.language === "ru"
      ? `Если смотреть не только на закон, а на ощущение на месте в ${context.location.name || "этой стране"}:`
      : `If we look at more than the law in ${context.location.name || "that place"}:`,
    composeCultureDetail(context),
    composeSocialDetail(context),
    composeFollowUp()
  ]).join("\n\n");
}

function generateGlobalCulture(context: AIContext) {
  const query = String(context.query || "").toLowerCase();
  if (/joint|джоинт|косяк/.test(query)) {
    const place = context.location.name || context.location.geoHint || "this place";
    return [
      `${place}: a joint, or "джоинт/косяк" in casual Russian, means cannabis rolled for smoking, usually in paper like a cigarette.`,
      "It is a culture word, not a safety word: saying joint, weed, косяк, or трава does not change the legal status of possession, buying, public use, or travel.",
      "The practical reading is simple: understand the slang, but judge the risk by local law, enforcement, and whether borders, airports, or public places are involved."
    ].join("\n\n");
  }
  if (/which performers|performers should i know|reggae and cannabis-culture angle/.test(query)) {
    return [
      "For the reggae and cannabis-culture angle, the core names are Bob Marley, Peter Tosh, Bunny Wailer, Burning Spear, and Lee Scratch Perry.",
      "Bob Marley is the global doorway into reggae and Rastafari imagery; Peter Tosh is the direct legalization voice; Lee Scratch Perry points toward dub and studio culture.",
      "Snoop Dogg fits the broader cannabis celebrity lane, but he is hip-hop rather than reggae/Rastafari."
    ].join("\n\n");
  }
  if (/what music fits|music fits cannabis culture|reggae, dub, roots/.test(query)) {
    const place = context.location.name || context.location.geoHint || "this place";
    return [
      `${place}: the cannabis-culture music lane is reggae, roots reggae, dub, and some dancehall, with local taste layered on top.`,
      "The reliable reference points are Bob Marley, Peter Tosh, Bunny Wailer, Burning Spear, and Lee Scratch Perry.",
      "That gives the mood and history, but it is culture, not permission: local cannabis law still controls possession, buying, and public use."
    ].join("\n\n");
  }
  if (/make love not war/.test(query)) {
    return [
      `${context.location.name || "This topic"}: Make Love, Not War became powerful because it compressed a whole 1960s anti-war mood into one line.`,
      "It came out of American counterculture and Vietnam War protest: peace, anti-violence, sexual freedom, and rejection of militarized politics all sat inside the phrase.",
      "The cannabis link is cultural, not legal: hippie scenes around Haight-Ashbury, rock festivals, and the Summer of Love made marijuana highly visible, so the slogan lives in the same world even though its origin is anti-war."
    ].join("\n\n");
  }
  if (/while staying here|permission|confusing culture with permission/.test(query)) {
    const place = context.location.name || context.location.geoHint || "this place";
    return [
      `${place}: the cultural frame can be useful, but it does not create permission.`,
      "Weed movies, reggae mood, and Rastafari symbols belong to cannabis culture; they do not override local law, police practice, or public-use rules.",
      "The safest reading is to enjoy the references as culture, while treating possession, buying, public use, and travel as separate legal-risk questions."
    ].join("\n\n");
  }
  if (/420|4\s*20|4:20/.test(query)) {
    if (/legal|law|here|change anything|change/.test(query)) {
      const place = context.location.name || context.location.geoHint || "this place";
      return [
        `${place}: 420 culture does not change the legal situation.`,
        "420 is cannabis slang and a cultural symbol, not a legal permission or a protected category.",
        "So even if people recognize the reference, the practical answer still comes from local cannabis law, enforcement, and how public behavior is treated on the ground."
      ].join("\n\n");
    }
    return [
      "420 is cannabis slang, not a legal category, and the common origin story points to California in 1971.",
      "The usual origin story points to a California high-school group called the Waldos, who used 4:20 as a meetup code.",
      "From there it spread into wider cannabis culture and turned April 20 into a symbolic day for gatherings, activism, and celebration."
    ].join("\n\n");
  }
  if (/reggae|marley|rastafari/.test(query)) {
    if (/legal meaning|legally important|just cultural|law|permission|here|local/.test(query)) {
      const place = context.location.name || context.location.geoHint || "this place";
      return [
        `${place}: reggae or Rastafari culture has cultural meaning, not legal force.`,
        "The connection is real historically: reggae and Rastafari language often use ganja as a spiritual or countercultural symbol.",
        "But on the ground, that does not change cannabis law, police discretion, public-use risk, or airport and border rules."
      ].join("\n\n");
    }
    return [
      "The clearest reggae-linked cannabis figures are Bob Marley, Peter Tosh, and Bunny Wailer.",
      "That link comes less from celebrity branding and more from Rastafari culture, where ganja was treated as part of spiritual and countercultural practice.",
      "Snoop Dogg belongs in cannabis celebrity culture too, but he is more hip-hop than reggae."
    ].join("\n\n");
  }
  if (/airport|import|make love not war/.test(query)) {
    return [
      "\"Make Love, Not War\" is a 1960s anti-war slogan tied to American counterculture and Vietnam War protest.",
      "It means: choose peace, intimacy, and human connection over violence and militarized politics.",
      "It is not a cannabis permission rule, but it absolutely sits inside the hippie-counterculture environment where marijuana use was widespread and visible."
    ].join("\n\n");
  }
  return generateCulture(context);
}

function shouldUseCultureEngine(context: AIContext, query: string) {
  return context.intent === "culture" || context.history.lastIntent === "culture" || isCultureFollowupQuery(query);
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
  lines.push(`The calm bottom line for ${place} is: do not rely on being a tourist, on good intentions, or on paperwork to make cannabis-related risk disappear.`);
  return lines.join("\n\n");
}

function generateMarketAccess(context: AIContext) {
  const place = context.location.name || context.location.geoHint || "this place";
  const recreational = String(context.legal?.recreational || "unknown").toLowerCase().replaceAll("_", " ");
  const distribution = String(context.legal?.distribution || "unknown").toLowerCase().replaceAll("_", " ");
  const risk = formatRiskSignal(context.legal?.finalRisk);
  const regulated = /regulated|legal/.test(distribution) || /legal|decrim/.test(recreational);
  return [
    `${place}: do not read a legal or tolerated cannabis system as automatic tourist access.`,
    `The current data reads recreational status as ${recreational}, distribution as ${distribution}, and the practical risk signal as ${risk}.`,
    regulated
      ? "Even where a market exists, access can depend on local rules, registration, residency, clubs, pharmacies, or licensed channels."
      : "If distribution is not clearly legal, a visitor trying to buy is moving into the riskiest part of the system.",
    "The useful rule is simple: being a visitor does not create a right to buy, and crossing borders with cannabis remains a separate high-risk issue."
  ].join("\n\n");
}

function generateGeneral(context: AIContext) {
  if (isCasualQuery(context.normalizedQuery || context.query)) {
    return dedupeBlocks([
      composeCasualReply(context),
      composeFollowUp()
    ]).join("\n\n");
  }
  return dedupeBlocks([
    composeLead(context),
    context.intent === "airport" || context.intent === "tourists" ? composeTravelDetail(context) : null,
    composeLegalDetail(context),
    composeSocialDetail(context),
    composeMedicalDetail(context),
    composeFollowUp()
  ]).join("\n\n");
}

function cleanDirectAnswer(answer: string) {
  const seen = new Set<string>();
  return String(answer || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    })
    .slice(0, 6)
    .join("\n");
}

function buildSlangCultureAnswer(query: string, language: string) {
  const q = String(query || "").toLowerCase();
  if (/420|4\s*20|4:20/.test(q)) {
    return language === "ru"
      ? cleanDirectAnswer([
          "420 — это сленг из Калифорнии (1971).",
          "Группа школьников Waldos встречалась в 4:20 после уроков и так зашифровала тему.",
          "Позже это стало кодом для каннабиса и датой 20 апреля.",
          "Это культурный термин, не legal-статус и не разрешение."
        ].join("\n"))
      : cleanDirectAnswer([
          "420 is cannabis slang from California, usually traced to 1971.",
          "A high-school group called the Waldos used 4:20 as an after-school meetup code.",
          "It later became a cannabis-culture code, and April 20 became a symbolic date.",
          "It is culture, not legal permission."
        ].join("\n"));
  }

  if (/joint|джоинт|косяк/.test(q)) {
    return language === "ru"
      ? cleanDirectAnswer([
          "Джоинт — это самокрутка с каннабисом, обычно в бумаге как сигарета.",
          "«Косяк» — близкий разговорный русский вариант этого слова.",
          "Это термин культуры и быта, а не юридический статус.",
          "Если вопрос про закон — лучше отдельно назвать страну."
        ].join("\n"))
      : cleanDirectAnswer([
          "A joint is cannabis rolled for smoking, usually in paper like a cigarette.",
          "It is a culture/slang word, not a legal category.",
          "The word itself says nothing about whether possession or use is allowed.",
          "If you mean the law, name the country separately."
        ].join("\n"));
  }

  if (/make love not war|хиппи|hippie/.test(q)) {
    return language === "ru"
      ? cleanDirectAnswer([
          "Make Love, Not War — лозунг контркультуры 1960-х и протестов против войны во Вьетнаме.",
          "Он про мир, близость и отказ от милитаризма.",
          "С каннабисом связь культурная: хиппи-сцена делала марихуану заметной частью образа эпохи.",
          "Но сам лозунг не про закон и не даёт разрешений."
        ].join("\n"))
      : cleanDirectAnswer([
          "Make Love, Not War is a 1960s counterculture slogan tied to Vietnam War protest.",
          "It means peace, intimacy, and rejection of militarized politics.",
          "Its cannabis link is cultural: hippie scenes made marijuana highly visible in that era.",
          "The slogan itself is not a legal rule."
        ].join("\n"));
  }

  if (/movie|film|фильм|кино/.test(q)) {
    return language === "ru"
      ? cleanDirectAnswer([
          "Если про каннабис/регги-уклон, смотри документалки и фильмы вокруг Bob Marley, Peter Tosh и Rastafari-сцены.",
          "Из более широкой weed-culture линии подойдут комедии и контркультурные фильмы, но лучше не путать их с юридической реальностью.",
          "Ключ: кино объясняет настроение и символы, а не правила страны."
        ].join("\n"))
      : cleanDirectAnswer([
          "For a cannabis/reggae angle, start with documentaries and films around Bob Marley, Peter Tosh, and Rastafari culture.",
          "For broader weed culture, counterculture comedies and social documentaries fit better than random crime films.",
          "The key boundary: films explain mood and symbols, not local law."
        ].join("\n"));
  }

  if (/music|музыка|исполнитель|artist|actor|актер|актёр|snoop|marley|peter tosh|bunny wailer/.test(q)) {
    return language === "ru"
      ? cleanDirectAnswer([
          "В каннабис/регги-культуре базовые имена: Bob Marley, Peter Tosh, Bunny Wailer.",
          "Snoop Dogg — уже шире, это cannabis celebrity culture через хип-хоп, не ядро регги.",
          "Эти имена помогают понять стиль и символы, но не заменяют факты по закону."
        ].join("\n"))
      : cleanDirectAnswer([
          "Core cannabis/reggae-culture names are Bob Marley, Peter Tosh, and Bunny Wailer.",
          "Snoop Dogg belongs to broader cannabis celebrity culture through hip-hop, not the reggae core.",
          "Those names explain style and symbols, but they do not replace legal facts."
        ].join("\n"));
  }

  if (/reggae|регги|растафари|rastafari|марли|marley/.test(q)) {
    return language === "ru"
      ? cleanDirectAnswer([
          "Регги и Rastafari связаны с каннабисом через культуру, символы и духовную практику.",
          "Ключевые имена: Bob Marley, Peter Tosh, Bunny Wailer.",
          "Это помогает понять язык и настроение сцены, но не меняет закон.",
          "Юридический вопрос лучше задавать отдельно по стране."
        ].join("\n"))
      : cleanDirectAnswer([
          "Reggae and Rastafari connect to cannabis through culture, symbols, and spiritual practice.",
          "Core names are Bob Marley, Peter Tosh, and Bunny Wailer.",
          "That explains the language and mood, but it does not change the law.",
          "Ask separately by country if you mean legal status."
        ].join("\n"));
  }

  return language === "ru"
    ? "Уточни, ты про историю термина, культуру или закон?"
    : "Clarify: do you mean the term history, culture, or the law?";
}

function buildChatAnswer(query: string, language: string) {
  const q = String(query || "").toLowerCase().trim();
  if (/лажа|бред|мусор|не то/.test(q)) {
    return language === "ru"
      ? "Понял. Уточни, ты про термин, культуру или закон?"
      : "Got it. Clarify whether you mean the term, culture, or the law.";
  }
  if (/че каг|че как|чё как|как сам|как дела|еу|йо|yo|sup|wazz|hello|hi|hey/.test(q)) {
    return language === "ru"
      ? "На связи. Спроси про термин, культуру или закон."
      : "I’m here. Ask about a term, culture, or the law.";
  }
  return language === "ru"
    ? "Уточни, ты про историю термина, культуру или закон?"
    : "Clarify: do you mean the term history, culture, or the law?";
}

function buildFallbackAnswer(query: string, language: string, routedIntent: ReturnType<typeof classifyIntent>["intent"]) {
  if (routedIntent === "SLANG") return buildSlangCultureAnswer(query, language);
  if (routedIntent === "CHAT") return buildChatAnswer(query, language);
  if (routedIntent === "UNKNOWN") {
    return language === "ru"
      ? "Уточни, что именно ты имеешь в виду: термин, культуру или закон?"
      : "Clarify what exactly you mean: the term, culture, or the law.";
  }
  return null;
}

function needsIntentFallback(
  routedIntent: ReturnType<typeof classifyIntent>["intent"],
  answer: string | null,
  language: string
) {
  if (!answer) return true;
  const text = String(answer || "").trim();
  const lower = text.toLowerCase();
  if (routedIntent === "SLANG") {
    return /ivory coast|côte d'ivoire|closest places|risk:|not legal advice|distribution status|medical status/i.test(lower);
  }
  if (routedIntent === "CHAT") {
    return text.length < 2 || text.length > 160 || /ivory coast|closest places|risk:|wikipedia|distribution|legal status/i.test(lower);
  }
  if (routedIntent === "UNKNOWN") {
    const ruClarify = language === "ru" && /уточни|имеешь в виду/i.test(lower);
    const enClarify = language !== "ru" && /clarify|what do you mean|what exactly/i.test(lower);
    return !(ruClarify || enClarify);
  }
  return false;
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
  if (/^why\??$/i.test(String(context.query || "").trim())) {
    return [
      `${current} versus ${compare}: the reason the risk differs is not culture or vibes, it is the legal status plus enforcement exposure.`,
      `${current} carries a ${currentRisk} risk signal; ${compare} carries a ${compareRisk} risk signal.`,
      "That means the safer side is the one with clearer lawful channels, lower enforcement exposure, and less chance that a small mistake turns into police, customs, or border trouble.",
      `For this pair, ${safer} still looks safer in practical terms, but crossing borders with cannabis remains a bad idea in both directions.`
    ].join("\n\n");
  }
  return [
    `${current} and ${compare} are not the same situation.`,
    `${current}: overall status is ${currentStatus}, with a ${currentRisk} risk signal.`,
    `${compare}: overall status is ${compareStatus}, with a ${compareRisk} risk signal.`,
    `If the question is which is safer, ${safer} looks safer in practical terms, but travel or border movement with cannabis is still a bad idea.`
  ].join("\n\n");
}

export function generateAnswer(context: AIContext): string {
  const query = context.normalizedQuery || context.query;
  const activeShortFollowUp =
    Boolean(context.history.lastIntent) &&
    (isContinuationQuery(query) || isCultureFollowupQuery(query) || /^(why(?: not)?|почему)\??$/i.test(String(query || "").trim()));
  const continuation = (isContinuationQuery(query) || activeShortFollowUp) && Boolean(context.history.lastIntent);
  if (context.slangType === "greeting" && context.intent === "general") {
    return buildSlangGreetingAnswer(context);
  }
  if (context.intent === "nearby") {
    return finalizeAnswer(context, generateNearby(context), context.intent);
  }
  if (isGlobalCultureQuery(query)) {
    return finalizeAnswer(context, generateGlobalCulture(context), "culture");
  }
  if (context.compare?.name && /compare|safer|why/i.test(query)) {
    return finalizeAnswer(context, generateComparison(context), context.intent);
  }
  if (isMarketAccessQuery(query)) {
    return finalizeAnswer(context, generateMarketAccess(context), "buy");
  }
  if (isBasicLawQuery(query)) {
    return finalizeAnswer(context, generateLegal(context), "legal");
  }
  if (isTravelRiskQuery(query)) {
    return finalizeAnswer(context, generateTravelRiskAnswer(context), context.intent);
  }
  if (isTraceRiskQuery(query)) {
    return finalizeAnswer(context, generateTraceRisk(context), context.intent);
  }
  if (isSmallAmountRiskQuery(query)) {
    return finalizeAnswer(context, generateSmallAmountRisk(context), context.intent);
  }
  if (isProductRiskQuery(query)) {
    return finalizeAnswer(context, generateProductRisk(context), context.intent);
  }
  if (shouldUseCultureEngine(context, query)) {
    return finalizeAnswer(context, generateCulture(context), "culture");
  }
  if (continuation) {
    return finalizeAnswer(context, continueLastTopic(context), context.intent);
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
    return finalizeAnswer(context, rewriteRepeatedAnswer(context, answer), context.intent);
  }
  return finalizeAnswer(context, answer, context.intent);
}

function finalizeAnswer(context: AIContext, answer: string, intent?: string) {
  return applyTone(
    applyDialogStyle(ensureNonEmptyAnswer(context, answer), intent, context.language),
    context.tone || "neutral",
    context.slangType || "unknown",
    context.language,
    context.query
  );
}

function buildSlangGreetingAnswer(context: AIContext) {
  if (context.language === "en") return buildGreetingAnswer("en", context.query);
  if (context.language === "ru") return buildGreetingAnswer("ru", context.query);
  return buildIntro(context.tone || "casual", "greeting", context.language, context.query);
}

export function buildGreetingAnswer(_language?: string, input = "") {
  return buildReaction(input, "greeting");
}

function generateNearby(context: AIContext) {
  if (!context.nearby?.results?.length) {
    return context.language === "ru"
      ? "Рядом я пока не вижу честных nearby-вариантов по текущим данным. Это не значит, что вариантов нет, а значит, что текущий truth-layer их не подтверждает."
      : "I do not see any honest nearby options in the current data yet. That does not prove there are none, only that this truth layer does not confirm them.";
  }
  const top = context.nearby.results.slice(0, 4);
  if (context.language === "ru") {
    const lines = top.map((item, index) =>
      [
        `${index + 1}. ${item.country} — ~${Math.round(item.effectiveDistanceKm)} км`,
        `   ${formatNearbyAccess(item.accessType, "ru")}`,
        `   Risk: ${formatNearbyRisk(item.destinationRisk)}`
      ].join("\n")
    );
    return [
      "Ближайшие места, где каннабис возможен по текущим данным:",
      "",
      ...lines,
      "",
      `⚠️ ${context.nearby.warning}`
    ].join("\n");
  }
  const lines = top.map((item, index) =>
    [
      `${index + 1}. ${item.country} — ~${Math.round(item.effectiveDistanceKm)} km`,
      `   ${formatNearbyAccess(item.accessType, "en")}`,
      `   Risk: ${formatNearbyRisk(item.destinationRisk)}`
    ].join("\n")
  );
  return [
    "Closest places where cannabis is possible:",
    "",
    ...lines,
    "",
    `⚠️ ${context.nearby.warning}`
  ].join("\n");
}

function formatNearbyAccess(accessType: NonNullable<AIContext["nearby"]>["results"][number]["accessType"], language: string) {
  if (language === "ru") {
    if (accessType === "legal") return "Legal / allowed";
    if (accessType === "mostly_allowed") return "Mostly allowed";
    if (accessType === "limited") return "Limited";
    if (accessType === "tolerated") return "Tolerated";
    return "Strict";
  }
  if (accessType === "legal") return "Legal";
  if (accessType === "mostly_allowed") return "Mostly allowed";
  if (accessType === "limited") return "Limited";
  if (accessType === "tolerated") return "Tolerated";
  return "Strict";
}

function formatNearbyRisk(risk: NonNullable<AIContext["nearby"]>["results"][number]["destinationRisk"]) {
  return risk.toUpperCase();
}

function injectDonation(answer: string) {
  return answer;
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
  const routed = classifyIntent(query);
  const state = getDialogState();
  const activeShortFollowUp =
    Boolean(state.lastIntent) &&
    (isContinuationQuery(query) || isCultureFollowupQuery(query) || /^(why(?: not)?|почему)\??$/i.test(String(query || "").trim()));
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
  if (shouldUseNearbyTruth(query, context)) {
    const nearbyContext = { ...context, intent: "nearby" as const };
    const answer = generateAnswer(nearbyContext);
    rememberDialog(nearbyContext, answer);
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
    const intentFallback = buildFallbackAnswer(query, context.language, routed.intent);
    const shouldFallbackByIntent =
      (routed.intent === "SLANG" || (routed.intent === "CHAT" && !activeShortFollowUp) || (routed.intent === "UNKNOWN" && !activeShortFollowUp)) &&
      needsIntentFallback(routed.intent, normalizedAnswer, context.language);
    answer =
      normalizedAnswer && !needsOutputRetry(context, normalizedAnswer) && !shouldFallbackByIntent
        ? normalizedAnswer
        : intentFallback || generateAnswer(context);
    rememberDialog(context, answer);
    if (answer.length > 60) {
      saveMemory({
        query,
        intent: context.intent,
        location: context.location.geoHint || undefined,
        answer,
        score: scoreMemory(answer, Boolean(context.history.lastIntent))
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
