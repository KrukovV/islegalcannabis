import type { CountryCardEntry } from "@/new-map/map.types";
import {
  deriveMapCategoryFromCountryPageDataSignals,
  deriveResultStatusFromCountryPageData,
  statusToColor
} from "@/lib/resultStatus";
import type { CountryPageData } from "@/lib/countryPageStorage";
import { assertCannabisWikiSource, isCannabisWikiSource } from "@/lib/wiki/cannabisSource";

function includesFold(text: string, probe: string) {
  return String(text || "").toLowerCase().includes(String(probe || "").toLowerCase());
}

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

function buildMapColorReason(data: CountryPageData) {
  const resultStatus = deriveResultStatusFromCountryPageData(data);
  const mapCategory = deriveMapCategoryFromCountryPageDataSignals(data, resultStatus);
  const explainText = [
    ...(data.legal_model.signals?.explain || []),
    data.notes_normalized || "",
    data.notes_raw || "",
    data.facts.possession_limit || "",
    data.facts.cultivation || "",
    data.facts.penalty || ""
  ]
    .join(" ")
    .toLowerCase();

  if (mapCategory === "LIMITED_OR_MEDICAL") {
    if (data.legal_model.medical.status === "LEGAL" || data.legal_model.medical.status === "LIMITED") {
      return "Yellow because recreational law remains illegal, but medical access exists.";
    }
    if (
      data.legal_model.signals?.enforcement_level === "rare" ||
      data.legal_model.signals?.enforcement_level === "unenforced" ||
      includesFold(explainText, "rarely prosecuted") ||
      includesFold(explainText, "often unenforced") ||
      includesFold(explainText, "not enforced")
    ) {
      return "Yellow because formal illegality is softened by weak or uneven enforcement.";
    }
    return "Yellow because restrictions remain, but some lawful or tolerated access exists.";
  }

  if (mapCategory === "LEGAL_OR_DECRIM" && resultStatus !== "LEGAL") {
    if (
      data.legal_model.recreational.status === "DECRIMINALIZED" ||
      includesFold(explainText, "decriminalized")
    ) {
      return "Green because personal use is decriminalized and current access is partially allowed in practice.";
    }
    if (
      includesFold(explainText, "tolerated") ||
      includesFold(explainText, "coffee shop") ||
      includesFold(explainText, "coffeeshop")
    ) {
      return "Green because formal illegality is softened by tolerated local practice.";
    }
    if (
      includesFold(explainText, "licensed") ||
      includesFold(explainText, "dispensary") ||
      includesFold(explainText, "government-owned shops sell cannabis") ||
      includesFold(explainText, "bhang") ||
      includesFold(explainText, "social club") ||
      includesFold(explainText, "allowed to grow")
    ) {
      return "Green because formal illegality is offset by limited legal or semi-open access in practice.";
    }
    return "Green because the final status is mixed: formal illegality is offset by decriminalized, tolerated, or limited-access practice.";
  }

  return null;
}

export function deriveCountryCardEntryFromCountryPageData(data: CountryPageData): CountryCardEntry {
  const resultStatus = deriveResultStatusFromCountryPageData(data);
  const mapCategory = deriveMapCategoryFromCountryPageDataSignals(data, resultStatus);
  const mapReason = buildMapColorReason(data);
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

  const summary =
    mapCategory === "ILLEGAL"
      ? "Illegal under current law."
      : mapCategory === "LIMITED_OR_MEDICAL"
        ? "Restricted, but limited lawful access exists."
        : resultStatus === "LEGAL"
          ? "Lawful access is confirmed."
          : "Decriminalized or partly allowed in practice.";

  if (mapCategory === "ILLEGAL") {
    why.push(buildReason("why-red", "Red because hard restrictions remain and no lawful access is confirmed.", "#law-status-explanation", reasonSourceUrl));
  } else if (mapCategory === "LIMITED_OR_MEDICAL") {
    why.push(buildReason("why-yellow", mapReason || "Yellow because restrictions remain, but there is limited lawful access.", "#law-status-explanation", reasonSourceUrl));
  } else {
    why.push(buildReason("why-green", mapReason || "Green because current access is legal, decriminalized, or tolerated.", "#law-status-explanation", reasonSourceUrl));
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
      status: resultStatus,
      color: statusToColor(resultStatus)
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
    notes: data.notes_normalized || data.notes_raw,
    panel: {
      levelTitle:
        mapCategory === "ILLEGAL"
          ? "Illegal"
          : mapCategory === "LIMITED_OR_MEDICAL"
            ? "Restricted"
            : "Legal or partly allowed",
      summary,
      critical: critical.slice(0, 5),
      info: info.slice(0, 5),
      why: why.slice(0, 2)
    },
    sources,
    coordinates: data.coordinates || undefined
  };
}
