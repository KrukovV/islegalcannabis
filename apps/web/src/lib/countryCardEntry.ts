import type { CountryCardEntry } from "@/new-map/map.types";
import {
  deriveMapCategoryFromCountryPageDataSignals,
  mapCategoryToColor
} from "@/lib/resultStatus";
import type { CountryPageData } from "@/lib/countryPageStorage";
import { buildCannabisProfileCard } from "@/lib/cannabisProfile";
import { assertCannabisWikiSource, isCannabisWikiSource } from "@/lib/wiki/cannabisSource";
import { getHumanStatusHeadline, getHumanStatusSummary } from "@/lib/statusHumanText";
import { applyStatusReviewOverrideToCountryPageData } from "@/lib/statusReviewOverrides";

function summarizeLegalModel(data: CountryPageData) {
  const model = data.legal_model.recreational;
  return `${model.status} · ${model.enforcement} · ${model.scope}`;
}

function summarizeMedicalModel(data: CountryPageData) {
  const model = data.legal_model.medical;
  return `${model.status} · ${model.scope}`;
}

function summarizeDistributionModel(data: CountryPageData) {
  return data.legal_model.distribution.status;
}

function buildMapColorReason(mapCategory: CountryCardEntry["mapCategory"]) {
  return getHumanStatusSummary(mapCategory);
}

function resultStatusFromMapCategory(mapCategory: CountryCardEntry["mapCategory"]) {
  if (mapCategory === "LEGAL_OR_DECRIM") return "LEGAL" as const;
  if (mapCategory === "UNKNOWN") return "UNKNOWN" as const;
  return "ILLEGAL" as const;
}

export function deriveCountryCardEntryFromCountryPageData(data: CountryPageData): CountryCardEntry {
  data = applyStatusReviewOverrideToCountryPageData(data);
  const mapCategory = deriveMapCategoryFromCountryPageDataSignals(data);
  const mapReason = buildMapColorReason(mapCategory);
  const pageHref = `/c/${data.code}`;
  const legalSourceUrl = isCannabisWikiSource(data.sources.legal) ? assertCannabisWikiSource(data.sources.legal) : null;
  const sources = (data.sources.citations || []).slice(0, 3).map((source) => ({
    id: source.id,
    title: source.title,
    url: source.url
  }));
  const reasonSourceUrl = legalSourceUrl || sources[0]?.url;
  const buildReason = (id: string, text: string, anchor: string, sourceUrl?: string) => ({
    id,
    text,
    href: `${pageHref}${anchor}`,
    ...(sourceUrl ? { sourceUrl } : {})
  });
  const critical: CountryCardEntry["panel"]["critical"] = [];
  const info: CountryCardEntry["panel"]["info"] = [];
  const why: CountryCardEntry["panel"]["why"] = [];

  if (data.legal_model.recreational.status === "ILLEGAL") {
    critical.push(buildReason("rec-illegal", "Recreational use is banned.", "#law-recreational", reasonSourceUrl));
  } else if (data.legal_model.recreational.status === "DECRIMINALIZED") {
    info.push(buildReason("rec-decrim", "Small personal-use possession is decriminalized.", "#law-recreational", reasonSourceUrl));
  } else if (data.legal_model.recreational.status === "TOLERATED") {
    info.push(buildReason("rec-tolerated", "Personal use is tolerated in practice.", "#law-recreational", reasonSourceUrl));
  } else if (data.legal_model.recreational.status === "LEGAL") {
    info.push(buildReason("rec-legal", "Recreational access is legal.", "#law-recreational", reasonSourceUrl));
  }

  if (data.legal_model.distribution.status === "illegal" || data.legal_model.distribution.status === "restricted") {
    critical.push(buildReason("distribution-illegal", "Sale and distribution stay banned.", "#law-distribution", reasonSourceUrl));
  } else if (
    data.legal_model.distribution.status === "mixed" ||
    data.legal_model.distribution.status === "tolerated" ||
    data.legal_model.distribution.status === "regulated"
  ) {
    info.push(buildReason("distribution-mixed", "Access depends on local channels and conditions.", "#law-distribution", reasonSourceUrl));
  }

  if (data.legal_model.signals?.penalties?.prison) {
    critical.push(buildReason("penalty-prison", "Criminal penalties can include prison.", "#law-risk", reasonSourceUrl));
  } else if (data.legal_model.signals?.penalties?.arrest) {
    critical.push(buildReason("penalty-arrest", "Police detention risk is present.", "#law-risk", reasonSourceUrl));
  } else if (data.legal_model.signals?.penalties?.fine) {
    info.push(buildReason("penalty-fine", "Small-amount penalties are usually fines.", "#law-risk", reasonSourceUrl));
  }

  if (data.legal_model.medical.status === "LEGAL" || data.legal_model.medical.status === "LIMITED") {
    info.push(
      buildReason(
        "medical-access",
        data.legal_model.medical.status === "LEGAL" ? "Medical access exists." : "Medical access is limited.",
        "#law-medical",
        reasonSourceUrl
      )
    );
  }

  if (data.legal_model.signals?.enforcement_level === "rare" || data.legal_model.signals?.enforcement_level === "unenforced") {
    info.push(buildReason("weak-enforcement", "Enforcement is often weak in practice.", "#law-risk", reasonSourceUrl));
  }

  const summary = getHumanStatusHeadline(mapCategory);

  if (mapCategory === "ILLEGAL") {
    why.push(buildReason("why-red", getHumanStatusSummary(mapCategory), "#law-status-explanation", reasonSourceUrl));
  } else if (mapCategory === "LIMITED_OR_MEDICAL") {
    why.push(buildReason("why-yellow", getHumanStatusSummary(mapCategory), "#law-status-explanation", reasonSourceUrl));
  } else {
    why.push(buildReason("why-green", getHumanStatusSummary(mapCategory), "#law-status-explanation", reasonSourceUrl));
  }

  return {
    geo: data.geo_code,
    code: data.code,
    pageHref,
    detailsHref: legalSourceUrl,
    displayName: data.name,
    iso2: data.node_type === "state" ? data.geo_code : data.iso2,
    type: data.node_type,
    result: {
      status: resultStatusFromMapCategory(mapCategory),
      color: mapCategoryToColor(mapCategory)
    },
    mapCategory,
    mapReason,
    normalizedStatusSummary: data.notes_normalized,
    recreationalSummary: summarizeLegalModel(data),
    medicalSummary: summarizeMedicalModel(data),
    distributionSummary: summarizeDistributionModel(data),
    normalizedRecreationalStatus: data.legal_model.recreational.status,
    normalizedRecreationalEnforcement: data.legal_model.recreational.enforcement,
    normalizedRecreationalScope: data.legal_model.recreational.scope,
    normalizedMedicalStatus: data.legal_model.medical.status,
    normalizedMedicalScope: data.legal_model.medical.scope,
    normalizedDistributionStatus: data.legal_model.distribution.status,
    distributionFlags: data.legal_model.distribution.flags,
    statusFlags: data.legal_model.distribution.flags,
    cannabisProfile: buildCannabisProfileCard(data.geo_code),
    notes: data.notes_normalized || data.notes_raw,
    panel: {
      levelTitle:
        mapCategory === "ILLEGAL"
          ? "RED"
          : mapCategory === "LIMITED_OR_MEDICAL"
            ? "YELLOW"
            : "GREEN",
      summary,
      critical: critical.slice(0, 5),
      info: info.slice(0, 5),
      why: why.slice(0, 2)
    },
    sources,
    coordinates: data.coordinates || undefined
  };
}
