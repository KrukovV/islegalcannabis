import manualReviewOverrides from "../../../../data/status-engine/manual_review_overrides.json";
import type { CountryPageData } from "@/lib/countryPageStorage";

type ReviewOverride = {
  name?: string;
  recreational?: "LEGAL" | "ILLEGAL" | null;
  medical?: "REGULATED" | "LIMITED" | "NONE" | null;
  enforcement?: "SOFT" | "STRICT" | null;
  wikiRecStatus?: string | null;
  wikiMedStatus?: string | null;
  notes?: string | null;
  sources?: string[];
  reason?: string;
};

type OverridePayload = {
  entries?: Record<string, ReviewOverride>;
};

function normalizeGeo(geo: string | null | undefined) {
  return String(geo || "").trim().toUpperCase();
}

function mapRecreationalStatus(override: ReviewOverride): CountryPageData["legal_model"]["recreational"]["status"] {
  if (override.recreational === "LEGAL") return "LEGAL";
  return "ILLEGAL";
}

function mapMedicalStatus(override: ReviewOverride): CountryPageData["legal_model"]["medical"]["status"] {
  if (override.medical === "REGULATED") return "LEGAL";
  if (override.medical === "LIMITED") return "LIMITED";
  return "ILLEGAL";
}

function mapEnforcement(override: ReviewOverride): CountryPageData["legal_model"]["recreational"]["enforcement"] {
  if (override.enforcement === "SOFT") return "UNENFORCED";
  return "STRICT";
}

export function getStatusReviewOverride(geo: string | null | undefined) {
  const entries = (manualReviewOverrides as OverridePayload).entries || {};
  return entries[normalizeGeo(geo)] || null;
}

export function applyStatusReviewOverrideToCountryPageData(data: CountryPageData): CountryPageData {
  const override = getStatusReviewOverride(data.geo_code);
  if (!override) return data;
  const firstSource = override.sources?.find(Boolean) || data.sources.legal;
  return {
    ...data,
    legal_model: {
      ...data.legal_model,
      recreational: {
        ...data.legal_model.recreational,
        raw_status: mapRecreationalStatus(override),
        status: mapRecreationalStatus(override),
        enforcement: mapEnforcement(override),
        scope: override.recreational === "LEGAL" ? "PERSONAL_USE" : "NONE"
      },
      medical: {
        ...data.legal_model.medical,
        raw_status: mapMedicalStatus(override),
        status: mapMedicalStatus(override),
        enforcement: override.enforcement === "SOFT" ? "MODERATE" : "STRICT",
        scope: override.medical === "NONE" ? "NONE" : "MEDICAL_ONLY",
        override_reason: "STATUS_REVIEW_OVERRIDE"
      },
      distribution: {
        ...data.legal_model.distribution,
        flags: []
      },
      signals: data.legal_model.signals
        ? {
            ...data.legal_model.signals,
            enforcement_level: override.enforcement === "SOFT" ? "unenforced" : "active",
            explain: [`status_review_override: ${override.reason || normalizeGeo(data.geo_code)}`],
            sources: override.sources?.map((url) => ({
              title: `${override.name || data.name}: reviewed status source`,
              url,
              depth: 0,
              type: "reference" as const
            })) || data.legal_model.signals.sources
          }
        : data.legal_model.signals,
      enforcement_flags: []
    },
    notes_normalized: override.notes || data.notes_normalized,
    notes_raw: override.notes || data.notes_raw,
    sources: {
      ...data.sources,
      legal: firstSource,
      citations: override.sources?.length
        ? override.sources.map((url, index) => ({
            id: `status-review-override-${normalizeGeo(data.geo_code).toLowerCase()}-${index + 1}`,
            url,
            title: index === 0 ? `${override.name || data.name}: reviewed status source` : `${override.name || data.name}: supporting source`,
            type: "external" as const,
            weight: "low" as const
          }))
        : data.sources.citations
    }
  };
}
