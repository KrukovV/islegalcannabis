import fs from "node:fs";
import path from "node:path";
import { findRepoRoot } from "@/lib/ssotDiff/ssotSnapshotStore";
import { buildEvidencePassportCollection, sha256EvidencePayload } from "./evidencePassport";

export type EditorialLegalLocalisation = {
  id: string;
  geo: string;
  locale: string;
  assertionKind: "CURRENT_CONCLUSION" | "MATERIAL_RESTRICTION" | "SOURCE_ANNOTATION";
  sourceUrl: string;
  sourceLanguage: string;
  originalFragment: string;
  localizedText: string;
  territorialScope: string;
  disclaimer: string;
  editorReview: {
    state: "APPROVED";
    reviewerId: string;
    reviewedAt: string;
    originalCitationPreserved: true;
    scopePreserved: true;
    disclaimerPreserved: true;
  };
};

export type EditorialLocalisationRegistry = {
  schemaVersion: 1;
  localOnly: true;
  records: EditorialLegalLocalisation[];
};

export function editorialLocalisationRegistryPath(repoRoot = findRepoRoot(process.cwd())) {
  return path.join(repoRoot, "data", "b2b_evidence", "editorial_localisations.json");
}

function requiredText(value: unknown, field: string) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`EDITORIAL_LOCALISATION_${field}_REQUIRED`);
  return text;
}

export function validateEditorialLocalisationRegistry(value: unknown): EditorialLocalisationRegistry {
  const registry = value as Partial<EditorialLocalisationRegistry> | null;
  if (!registry || registry.schemaVersion !== 1 || registry.localOnly !== true || !Array.isArray(registry.records)) {
    throw new Error("EDITORIAL_LOCALISATION_REGISTRY_INVALID");
  }
  const canonicalGeos = new Set(buildEvidencePassportCollection().passports.map((passport) => passport.geo));
  const identities = new Set<string>();
  for (const record of registry.records) {
    const geo = requiredText(record.geo, "GEO").toUpperCase();
    if (!canonicalGeos.has(geo)) throw new Error(`EDITORIAL_LOCALISATION_UNKNOWN_GEO=${geo}`);
    requiredText(record.id, "ID");
    requiredText(record.locale, "LOCALE");
    requiredText(record.sourceLanguage, "SOURCE_LANGUAGE");
    requiredText(record.originalFragment, "ORIGINAL_FRAGMENT");
    requiredText(record.localizedText, "LOCALIZED_TEXT");
    requiredText(record.territorialScope, "TERRITORIAL_SCOPE");
    requiredText(record.disclaimer, "DISCLAIMER");
    if (!/^https:\/\//.test(requiredText(record.sourceUrl, "SOURCE_URL"))) throw new Error(`EDITORIAL_LOCALISATION_SOURCE_URL_INVALID=${record.id}`);
    if (record.editorReview?.state !== "APPROVED" || !record.editorReview.reviewerId || Number.isNaN(Date.parse(record.editorReview.reviewedAt))) {
      throw new Error(`EDITORIAL_LOCALISATION_REVIEW_NOT_APPROVED=${record.id}`);
    }
    if (record.editorReview.originalCitationPreserved !== true || record.editorReview.scopePreserved !== true || record.editorReview.disclaimerPreserved !== true) {
      throw new Error(`EDITORIAL_LOCALISATION_PRESERVATION_NOT_PROVEN=${record.id}`);
    }
    const identity = `${geo}|${record.locale}|${record.assertionKind}`;
    if (identities.has(identity)) throw new Error(`EDITORIAL_LOCALISATION_DUPLICATE=${identity}`);
    identities.add(identity);
  }
  return registry as EditorialLocalisationRegistry;
}

export function loadEditorialLocalisationRegistry(repoRoot?: string) {
  return validateEditorialLocalisationRegistry(JSON.parse(fs.readFileSync(editorialLocalisationRegistryPath(repoRoot), "utf8")));
}

export function buildEditorialLocalisationManifest(geo?: string) {
  const normalizedGeo = String(geo || "").trim().toUpperCase();
  const registry = loadEditorialLocalisationRegistry();
  const records = normalizedGeo ? registry.records.filter((record) => record.geo === normalizedGeo) : registry.records;
  const unsigned = {
    schemaVersion: 1 as const,
    localOnly: true as const,
    publicationGate: "EDITOR_APPROVED_OR_NOT_PUBLISHED" as const,
    geo: normalizedGeo || null,
    approvedRecords: records.length,
    records
  };
  return { ...unsigned, payloadSha256: sha256EvidencePayload(unsigned) };
}
