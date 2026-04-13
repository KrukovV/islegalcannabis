import { STATUS_BANNERS } from "@islegal/shared";
import type {
  JurisdictionLawProfile,
  ResultViewModel,
  StatusPanelReason
} from "@islegal/shared";
import type { LocationContext } from "@/lib/location/locationContext";
import { buildBullets, buildRisks } from "@/lib/summary";
import {
  getCountryPageIndexByGeoCode,
  getCountryPageIndexByIso2
} from "@/lib/countryPageStorage";
import { normalizeStatus, type ResultStatus } from "@/lib/resultStatus";

function bulletsToText(profile: JurisdictionLawProfile) {
  return buildBullets(profile).map((item) => `${item.label}: ${item.value}`);
}

function toLocation(context?: LocationContext): ResultViewModel["location"] {
  if (!context) {
    return { mode: "query" };
  }

  return {
    mode: context.mode,
    method: context.method,
    confidence: context.confidence
  };
}

let countryPageIndexByIso2Cache: ReturnType<typeof getCountryPageIndexByIso2> | null = null;
let countryPageIndexByGeoCodeCache: ReturnType<typeof getCountryPageIndexByGeoCode> | null = null;

function getCountryPageHref(profile: JurisdictionLawProfile) {
  if (!countryPageIndexByIso2Cache) countryPageIndexByIso2Cache = getCountryPageIndexByIso2();
  if (!countryPageIndexByGeoCodeCache) countryPageIndexByGeoCodeCache = getCountryPageIndexByGeoCode();
  const country = String(profile.country || "").trim().toUpperCase();
  const region = String(profile.region || "").trim().toUpperCase();
  if (country === "US" && region) {
    return countryPageIndexByGeoCodeCache.get(`US-${region}`) ? `/c/us-${region.toLowerCase()}` : null;
  }
  const page = countryPageIndexByIso2Cache.get(country);
  return page ? `/c/${page.code}` : null;
}

function reasonLink(countryPageHref: string | null, anchor: string, sourceUrl?: string) {
  if (sourceUrl) return sourceUrl;
  if (countryPageHref) return `${countryPageHref}${anchor}`;
  return "/";
}

function findSourceUrl(profile: JurisdictionLawProfile, category: string) {
  const facts = Array.isArray(profile.facts) ? profile.facts : [];
  const factMatch = facts.find((fact) => String(fact.category || "").toLowerCase() === category);
  if (factMatch?.url) return factMatch.url;
  const legalSources = Array.isArray(profile.legal_ssot?.sources) ? profile.legal_ssot.sources : [];
  if (legalSources[0]?.url) return legalSources[0].url;
  return profile.sources[0]?.url;
}

function buildReason(
  id: string,
  text: string,
  href: string,
  sourceUrl?: string
): StatusPanelReason {
  return sourceUrl ? { id, text, href, sourceUrl } : { id, text, href };
}

function buildStatusPanel(profile: JurisdictionLawProfile, statusLevel: ResultViewModel["statusLevel"]) {
  const countryPageHref = getCountryPageHref(profile);
  const legalSsot = profile.legal_ssot;
  if (!legalSsot) {
    throw new Error("SSOT_MISSING_IN_UI");
  }
  const critical: StatusPanelReason[] = [];
  const info: StatusPanelReason[] = [];
  const why: StatusPanelReason[] = [];

  const recreational = legalSsot.recreational;
  const medical = legalSsot.medical;
  const distribution = legalSsot.distribution ?? null;
  const penalties = legalSsot.penalties;
  const enforcementLevel = legalSsot.enforcement_level ?? null;

  if (recreational === "illegal") {
    const sourceUrl = findSourceUrl(profile, "recreational");
    critical.push(
      buildReason(
        "recreational-illegal",
        "Recreational use remains illegal.",
        reasonLink(countryPageHref, "#law-recreational", sourceUrl),
        sourceUrl
      )
    );
  } else if (recreational === "decriminalized") {
    const sourceUrl = findSourceUrl(profile, "recreational");
    info.push(
      buildReason(
        "recreational-decrim",
        "Small personal-use possession is decriminalized.",
        reasonLink(countryPageHref, "#law-recreational", sourceUrl),
        sourceUrl
      )
    );
  } else if (recreational === "tolerated") {
    const sourceUrl = findSourceUrl(profile, "recreational");
    info.push(
      buildReason(
        "recreational-tolerated",
        "Recreational use is tolerated in practice.",
        reasonLink(countryPageHref, "#law-recreational", sourceUrl),
        sourceUrl
      )
    );
  } else if (recreational === "legal") {
    const sourceUrl = findSourceUrl(profile, "recreational");
    info.push(
      buildReason(
        "recreational-legal",
        "Recreational use is legal.",
        reasonLink(countryPageHref, "#law-recreational", sourceUrl),
        sourceUrl
      )
    );
  }

  if (distribution === "illegal" || distribution === "restricted") {
    const sourceUrl = findSourceUrl(profile, "distribution");
    critical.push(
      buildReason(
        "distribution-restricted",
        "Sale and distribution remain restricted.",
        reasonLink(countryPageHref, "#law-distribution", sourceUrl),
        sourceUrl
      )
    );
  } else if (distribution === "mixed" || distribution === "tolerated" || distribution === "regulated") {
    const sourceUrl = findSourceUrl(profile, "distribution");
    info.push(
      buildReason(
        "distribution-mixed",
        "Access depends on local channels and conditions.",
        reasonLink(countryPageHref, "#law-distribution", sourceUrl),
        sourceUrl
      )
    );
  }

  if (medical === "legal" || medical === "limited") {
    const sourceUrl = findSourceUrl(profile, "medical");
    info.push(
      buildReason(
        "medical-allowed",
        medical === "legal" ? "Medical use is permitted." : "Medical use is limited to specific cases.",
        reasonLink(countryPageHref, "#law-medical", sourceUrl),
        sourceUrl
      )
    );
  }

  if (penalties?.prison) {
    const sourceUrl = findSourceUrl(profile, "penalty");
    critical.push(
      buildReason(
        "penalty-prison",
        "Criminal penalties can include prison exposure.",
        reasonLink(countryPageHref, "#law-risk", sourceUrl),
        sourceUrl
      )
    );
  } else if (penalties?.arrest) {
    const sourceUrl = findSourceUrl(profile, "penalty");
    critical.push(
      buildReason(
        "penalty-arrest",
        "Police detention risk is present.",
        reasonLink(countryPageHref, "#law-risk", sourceUrl),
        sourceUrl
      )
    );
  } else if (penalties?.fine) {
    const sourceUrl = findSourceUrl(profile, "penalty");
    info.push(
      buildReason(
        "penalty-fine",
        "Small-amount penalties are typically fines.",
        reasonLink(countryPageHref, "#law-risk", sourceUrl),
        sourceUrl
      )
    );
  }

  if (enforcementLevel === "rare" || enforcementLevel === "unenforced") {
    const sourceUrl = findSourceUrl(profile, "penalty");
    info.push(
      buildReason(
        "enforcement-weak",
        "Enforcement is often limited in practice.",
        reasonLink(countryPageHref, "#law-risk", sourceUrl),
        sourceUrl
      )
    );
  }

  if (profile.cross_border === "illegal") {
    const sourceUrl = findSourceUrl(profile, "penalty");
    critical.push(
      buildReason(
        "border-illegal",
        "Cross-border transport remains illegal.",
        reasonLink(countryPageHref, "#law-border", sourceUrl),
        sourceUrl
      )
    );
  }

  const humanStatus =
    statusLevel === "green"
      ? "Legal"
      : statusLevel === "yellow"
        ? "Restricted or partly allowed"
        : statusLevel === "red"
          ? "Illegal"
          : "No reliable data";

  let summary = "Current law data is limited.";
  if (statusLevel === "green") {
    if (recreational === "legal") summary = "Recreational access is allowed under current law.";
    else if (medical === "legal" || medical === "limited") summary = "Access stays limited, but lawful channels exist.";
    else summary = "Formal limits are softened by decriminalized or tolerated practice.";
  } else if (statusLevel === "yellow") {
    if (medical === "legal" || medical === "limited") summary = "Medical access exists, but broader use stays restricted.";
    else summary = "The law stays restrictive, but practice is partly softened.";
  } else if (statusLevel === "red") {
    summary = "Core use and distribution remain prohibited under current law.";
  }

  if (statusLevel === "red") {
    const sourceUrl = findSourceUrl(profile, "recreational");
    why.push(
      buildReason(
        "why-red",
        "Hard legal restrictions were found in the current law.",
        reasonLink(countryPageHref, "#law-summary", sourceUrl),
        sourceUrl
      )
    );
  } else if (statusLevel === "yellow") {
    const sourceUrl = findSourceUrl(profile, "medical");
    why.push(
      buildReason(
        "why-yellow",
        "This status combines restrictions with limited lawful access or weaker enforcement.",
        reasonLink(countryPageHref, "#law-summary", sourceUrl),
        sourceUrl
      )
    );
  } else if (statusLevel === "green") {
    const sourceUrl = findSourceUrl(profile, "recreational");
    why.push(
      buildReason(
        "why-green",
        "No hard blocker overrides the current lawful or decriminalized access path.",
        reasonLink(countryPageHref, "#law-summary", sourceUrl),
        sourceUrl
      )
    );
  } else {
    const sourceUrl = profile.sources[0]?.url;
    why.push(
      buildReason(
        "why-gray",
        "The panel could not confirm current legal data with confidence.",
        reasonLink(countryPageHref, "#seo-content", sourceUrl),
        sourceUrl
      )
    );
  }

  for (const item of critical.slice(0, 2)) why.push(item);
  if (statusLevel !== "red" && info.length > 0) why.push(info[0]);

  return {
    humanStatus,
    summary,
    countryPageHref,
    critical: critical.slice(0, 4),
    info: info.slice(0, 4),
    why: why.slice(0, 3),
    lastUpdateLabel: profile.updated_at || undefined
  };
}

function statusLevelFromSsot(resultStatus: ResultStatus): ResultViewModel["statusLevel"] {
  if (resultStatus === "LEGAL" || resultStatus === "MIXED" || resultStatus === "DECRIM") return "green";
  if (resultStatus === "ILLEGAL") return "red";
  return "gray";
}

function statusTitleFromSsot(resultStatus: ResultStatus): string {
  if (resultStatus === "LEGAL") return "Recreational cannabis is legal";
  if (resultStatus === "MIXED") return "Partly allowed or mixed";
  if (resultStatus === "DECRIM") return "Decriminalized";
  if (resultStatus === "ILLEGAL") return "Illegal or highly restricted";
  return "Data not available";
}

export function buildResultViewModel(input: {
  profile: JurisdictionLawProfile;
  title: string;
  locationContext?: LocationContext;
  meta?: ResultViewModel["meta"];
  statusOverride?: { level: ResultViewModel["statusLevel"]; title: string };
  extrasPreview?: ResultViewModel["extrasPreview"];
  extrasFull?: ResultViewModel["extrasFull"];
  nearestLegal?: ResultViewModel["nearestLegal"];
}): ResultViewModel {
  const legalSsot = input.profile.legal_ssot;
  if (!legalSsot?.result_status) {
    throw new Error("SSOT_MISSING_IN_UI");
  }
  const resultStatus = normalizeStatus(legalSsot.result_status);
  let statusLevel = input.statusOverride?.level ?? statusLevelFromSsot(resultStatus);
  let statusTitle = input.statusOverride?.title ?? statusTitleFromSsot(resultStatus);

  if (input.profile.status === "provisional") {
    statusLevel = "yellow";
    statusTitle = STATUS_BANNERS.provisional.title;
  } else if (input.profile.status === "needs_review") {
    statusLevel = "gray";
    statusTitle = STATUS_BANNERS.needs_review.title;
  } else if (input.profile.status === "unknown") {
    statusLevel = "gray";
    statusTitle = "Data not available";
  }

  return {
    jurisdictionKey: input.profile.id,
    title: input.title,
    statusLevel,
    statusTitle,
    statusPanel: buildStatusPanel(input.profile, statusLevel),
    bullets: bulletsToText(input.profile),
    keyRisks: buildRisks(input.profile),
    sources: input.profile.sources,
    verifiedAt: input.profile.verified_at ?? undefined,
    updatedAt: input.profile.updated_at,
    extrasPreview: input.extrasPreview,
    extrasFull: input.extrasFull,
    nearestLegal: input.nearestLegal,
    location: toLocation(input.locationContext),
    meta: input.meta ?? {}
  };
}
