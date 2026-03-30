#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  buildStatusContract,
  isSupportedStatusPair,
  resolveColorKeyFromContract,
  resolveMapCategoryFromPair
} from "../../apps/web/src/lib/statusPairMatrix.js";
import { buildStatusDomainModel, buildStatusSnapshotMeta } from "../../apps/web/src/lib/statusDomainModel.js";

const ROOT = process.cwd();
const LEGAL_SSOT_PATH = path.join(ROOT, "data", "legal_ssot", "legal_ssot.json");
const WIKI_CLAIMS_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");
const WIKI_LEGALITY_TABLE_PATH = path.join(ROOT, "data", "wiki", "ssot_legality_table.json");
const OFFICIAL_OWNERSHIP_PATH = path.join(ROOT, "data", "ssot", "official_link_ownership.json");
const ARTIFACTS_DIR = path.join(ROOT, "Artifacts");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

const STATUS_WEIGHT = {
  Unknown: 0,
  Illegal: 1,
  Limited: 2,
  Unenforced: 2,
  Decrim: 3,
  Legal: 4
};

function collectTriggers(text) {
  const triggers = [];
  const sentences = String(text || "")
    .split(/(?<=[.!?;])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (/\billegal\b|\bprohibit(?:ed)?\b|\bbanned?\b/.test(lower)) {
      triggers.push({ phrase: normalizeText(sentence), rec: "Illegal", med: "Illegal" });
      continue;
    }
    if (/\bdecriminal/.test(lower)) {
      triggers.push({ phrase: normalizeText(sentence), rec: "Decrim" });
      continue;
    }
    if (/\bunenforced\b|\bnot enforced\b|\brarely enforced\b|\btolerated\b|\blax enforcement\b/.test(lower)) {
      triggers.push({ phrase: normalizeText(sentence), rec: "Unenforced" });
      continue;
    }
    if (/\bmedical\b/.test(lower) && /\b(legal|allowed|permitted|regulated)\b/.test(lower)) {
      triggers.push({ phrase: normalizeText(sentence), med: "Legal" });
      continue;
    }
    if (/\bmedical\b/.test(lower) && /\b(limited|restricted|only)\b/.test(lower)) {
      triggers.push({ phrase: normalizeText(sentence), med: "Limited" });
      continue;
    }
    if (/\b(legal|allowed|permitted|regulated|lawful)\b/.test(lower)) {
      triggers.push({ phrase: normalizeText(sentence), rec: "Legal" });
    }
  }
  return triggers;
}

function highestImpliedStatus(triggers, kind) {
  let best = "Unknown";
  for (const trigger of triggers) {
    const next = kind === "rec" ? trigger.rec : trigger.med;
    if (!next) continue;
    if (STATUS_WEIGHT[next] > STATUS_WEIGHT[best]) best = next;
  }
  return best;
}

function compareEvidence(finalStatus, impliedStatus) {
  if (STATUS_WEIGHT[impliedStatus] <= STATUS_WEIGHT[finalStatus]) return "NONE";
  return STATUS_WEIGHT[impliedStatus] - STATUS_WEIGHT[finalStatus] >= 2 ? "STRONG_CONFLICT" : "SOFT_CONFLICT";
}

function buildOfficialOwnershipIndex() {
  const payload = readJson(OFFICIAL_OWNERSHIP_PATH);
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const byGeo = new Map();
  for (const item of items) {
    if (!item?.effective || item?.is_active_for_country_coverage !== true) continue;
    const geos = Array.isArray(item.owner_geos) ? item.owner_geos : [];
    for (const geo of geos) {
      const key = String(geo || "").toUpperCase();
      if (!key) continue;
      const current = byGeo.get(key) || [];
      current.push(item);
      byGeo.set(key, current);
    }
  }
  return byGeo;
}

function resolveProjectionMetadata(params) {
  const finalDiffersFromWiki =
    params.finalRecStatus !== params.wikiRecStatus || params.finalMedStatus !== params.wikiMedStatus;
  let truthSourceLabel = "Unknown";
  if (params.notesAffectFinalStatus) {
    truthSourceLabel = "Reviewed notes rule";
  } else if (params.officialOverride) {
    truthSourceLabel = "Official override";
  } else if (params.ruleId && params.ruleId !== "DIRECT_FINAL_PAIR") {
    truthSourceLabel = "Status pair matrix";
  } else if (params.officialLinksCount > 0) {
    truthSourceLabel = "Wikipedia corroborated by official links";
  } else {
    truthSourceLabel = "Wikipedia";
  }

  let effectiveOfficialStrength = "NONE";
  if (params.officialOverride) {
    effectiveOfficialStrength = "OVERRIDE";
  } else if (params.officialLinksCount > 0) {
    effectiveOfficialStrength = "CORROBORATED";
  }

  let statusOverrideReason = "NONE";
  if (finalDiffersFromWiki) {
    if (params.notesAffectFinalStatus) {
      statusOverrideReason = params.evidenceDeltaReason || "APPROVED_NOTES_OVERRIDE";
    } else if (params.officialOverride) {
      statusOverrideReason = "OFFICIAL_OVERRIDE";
    } else if (params.ruleId && params.ruleId !== "DIRECT_FINAL_PAIR") {
      statusOverrideReason = params.ruleId;
    } else {
      statusOverrideReason = "MANUAL_REVIEW_REQUIRED";
    }
  }

  return { truthSourceLabel, effectiveOfficialStrength, statusOverrideReason };
}

const legalSsot = readJson(LEGAL_SSOT_PATH).entries || {};
const wikiClaims = readJson(WIKI_CLAIMS_PATH).items || {};
const wikiLegalityRows = readJson(WIKI_LEGALITY_TABLE_PATH).rows || [];
const wikiLegalityByIso = Object.fromEntries(
  wikiLegalityRows
    .map((row) => [String(row?.iso2 || "").toUpperCase(), row])
    .filter(([geo]) => Boolean(geo))
);
const officialOwnershipIndex = buildOfficialOwnershipIndex();
const geos = Array.from(new Set([...Object.keys(legalSsot), ...Object.keys(wikiClaims), ...Object.keys(wikiLegalityByIso)])).sort();
const snapshotMeta = buildStatusSnapshotMeta(
  geos.map((geo) => {
    const entry = legalSsot[geo] || {};
    const wiki = wikiClaims[geo] || {};
    const wikiTruthRow = wikiLegalityByIso[geo] || {};
    return {
      geoKey: geo,
      wikiRecStatus: wikiTruthRow.rec_status || wiki.wiki_rec || wiki.recreational_status,
      wikiMedStatus: wikiTruthRow.med_status || wiki.wiki_med || wiki.medical_status,
      finalRecStatus: entry.official_override_rec || wikiTruthRow.rec_status || wiki.wiki_rec || wiki.recreational_status,
      finalMedStatus: entry.official_override_med || wikiTruthRow.med_status || wiki.wiki_med || wiki.medical_status,
      finalMapCategory: "",
      truthSourceLabel: "",
      statusOverrideReason: "",
      updatedAt: entry.fetched_at || entry.updated_at || null
    };
  })
);

const fullRows = [];
const notesImpactRows = [];
const mismatchRows = [];
const overrideRows = [];
const forbiddenStatusPairs = [];

for (const geo of geos) {
  const entry = legalSsot[geo] || {};
  const wiki = wikiClaims[geo] || {};
  const wikiTruthRow = wikiLegalityByIso[geo] || {};
  const contract = buildStatusContract({
    wikiRecStatus: wikiTruthRow.rec_status || wiki.wiki_rec || wiki.recreational_status,
    wikiMedStatus: wikiTruthRow.med_status || wiki.wiki_med || wiki.medical_status,
    finalRecStatus: entry.official_override_rec || wikiTruthRow.rec_status || wiki.wiki_rec || wiki.recreational_status,
    finalMedStatus: entry.official_override_med || wikiTruthRow.med_status || wiki.wiki_med || wiki.medical_status,
    evidenceDeltaApproved: false
  });
  const notesOur = normalizeText(entry.notes || entry.extracted_facts?.notes);
  const notesWiki = normalizeText(wikiTruthRow.wiki_notes_hint || wiki.notes || wiki.notes_text);
  const notesPresent = Boolean(notesOur || notesWiki);
  const triggers = collectTriggers([notesOur, notesWiki].filter(Boolean).join("\n\n"));
  const impliedRec = highestImpliedStatus(triggers, "rec");
  const impliedMed = highestImpliedStatus(triggers, "med");
  const recDelta = compareEvidence(contract.finalRecStatus, impliedRec);
  const medDelta = compareEvidence(contract.finalMedStatus, impliedMed);
  const evidenceDelta =
    recDelta === "STRONG_CONFLICT" || medDelta === "STRONG_CONFLICT"
      ? "STRONG_CONFLICT"
      : recDelta === "SOFT_CONFLICT" || medDelta === "SOFT_CONFLICT"
        ? "SOFT_CONFLICT"
        : "NONE";
  const evidenceDeltaApproved = false;
  const officialOverride = Boolean(entry.official_override_rec || entry.official_override_med);
  const officialLinksCount = Array.isArray(officialOwnershipIndex.get(geo)) ? officialOwnershipIndex.get(geo).length : 0;
  const truthLevel = officialOverride ? "OFFICIAL" : officialLinksCount > 0 ? "WIKI_CORROBORATED" : "WIKI_ONLY";
  const domainModel = buildStatusDomainModel({
    geoKey: geo,
    wikiRecStatus: contract.wikiRecStatus,
    wikiMedStatus: contract.wikiMedStatus,
    finalRecStatus: contract.finalRecStatus,
    finalMedStatus: contract.finalMedStatus,
    notesOur,
    notesWiki,
    truthLevel,
    officialOverride,
    officialLinks: (officialOwnershipIndex.get(geo) || []).map((item) => item.url).filter(Boolean),
    reasons: contract.ruleId && contract.ruleId !== "DIRECT_FINAL_PAIR" ? [contract.ruleId] : [],
    wikiSourceUrl: wiki.wiki_row_url || null,
    snapshotMeta
  });
  const notesAffectFinalStatus = domainModel.contextExplainability.notesAffectFinalStatus;
  const finalMapCategory = domainModel.finalStatus.finalMapCategory;
  const renderedColorBucket = domainModel.finalStatus.mapColor;
  const popupRec = domainModel.finalStatus.finalRecStatus;
  const popupMed = domainModel.finalStatus.finalMedStatus;
  const row = {
    iso2: geo,
    geoId: geo,
    wikiRec: domainModel.wikiInput.wikiRecStatus,
    wikiMed: domainModel.wikiInput.wikiMedStatus,
    finalRec: domainModel.finalStatus.finalRecStatus,
    finalMed: domainModel.finalStatus.finalMedStatus,
    popupRec,
    popupMed,
    finalMapCategory,
    mapCategory: finalMapCategory,
    renderedColorBucket,
    ruleId: contract.ruleId || "DIRECT_FINAL_PAIR",
    truthSourceLabel: domainModel.finalStatus.truthSourceLabel,
    notesPresent: domainModel.contextExplainability.notesPresent,
    notesAffectFinalStatus,
    statusOverrideReason: domainModel.finalStatus.statusOverrideReason,
    officialLinksCount,
    effectiveOfficialStrength: domainModel.officialEvidence.effectiveOfficialStrength,
    evidenceDelta: domainModel.contextExplainability.evidenceDelta,
    evidenceDeltaReason: domainModel.contextExplainability.evidenceDeltaReason,
    triggerPhraseExcerpt: domainModel.contextExplainability.triggerPhraseExcerpt,
    evidenceSourceType: domainModel.contextExplainability.evidenceSourceType,
    evidenceDeltaApproved: domainModel.contextExplainability.evidenceDeltaApproved,
    contextNote: domainModel.contextExplainability.contextNote,
    enforcementNote: domainModel.contextExplainability.enforcementNote,
    socialRealityNote: domainModel.contextExplainability.socialRealityNote,
    officialEvidencePresent: domainModel.officialEvidence.officialEvidencePresent,
    snapshot_id: domainModel.finalStatus.finalSnapshotId,
    built_at: domainModel.snapshot.builtAt,
    dataset_hash: domainModel.snapshot.datasetHash,
    forbiddenPair: !isSupportedStatusPair(domainModel.finalStatus.finalRecStatus, domainModel.finalStatus.finalMedStatus)
  };
  fullRows.push(row);

  const mismatchReasons = [];
  if (popupRec !== domainModel.finalStatus.finalRecStatus || popupMed !== domainModel.finalStatus.finalMedStatus) mismatchReasons.push("POPUP_FINAL_MISMATCH");
  if (finalMapCategory !== resolveMapCategoryFromPair(domainModel.finalStatus.finalRecStatus, domainModel.finalStatus.finalMedStatus)) mismatchReasons.push("MAPCATEGORY_FINAL_MISMATCH");
  if (renderedColorBucket !== resolveColorKeyFromContract({ mapCategory: finalMapCategory })) mismatchReasons.push("RENDERED_COLOR_MISMATCH");
  if (notesAffectFinalStatus && !domainModel.contextExplainability.evidenceDeltaApproved) mismatchReasons.push("UNAPPROVED_NOTES_OVERRIDE");
  if (row.forbiddenPair) mismatchReasons.push("FORBIDDEN_STATUS_PAIR");
  if (mismatchReasons.length > 0) {
    mismatchRows.push({ ...row, mismatchReasons });
  }
  if (row.forbiddenPair) {
    forbiddenStatusPairs.push(row);
  }

  if (
    domainModel.finalStatus.finalRecStatus !== domainModel.wikiInput.wikiRecStatus ||
    domainModel.finalStatus.finalMedStatus !== domainModel.wikiInput.wikiMedStatus
  ) {
    const category = notesAffectFinalStatus ? "B" : officialOverride ? "C" : "D";
    const noteImpactRow = {
      geoId: geo,
      iso2: geo,
      wikiStatus: { rec: domainModel.wikiInput.wikiRecStatus, med: domainModel.wikiInput.wikiMedStatus },
      finalStatus: { rec: domainModel.finalStatus.finalRecStatus, med: domainModel.finalStatus.finalMedStatus },
      category,
      reason: domainModel.finalStatus.statusOverrideReason,
      triggerPhrase: domainModel.contextExplainability.triggerPhraseExcerpt,
      changesFinalStatus: notesAffectFinalStatus,
      reviewedRule: notesAffectFinalStatus ? domainModel.finalStatus.statusOverrideReason : officialOverride ? "OFFICIAL_OVERRIDE" : null
    };
    notesImpactRows.push(noteImpactRow);
    overrideRows.push(noteImpactRow);
  } else {
    overrideRows.push({
      geoId: geo,
      iso2: geo,
      wikiStatus: { rec: domainModel.wikiInput.wikiRecStatus, med: domainModel.wikiInput.wikiMedStatus },
      finalStatus: { rec: domainModel.finalStatus.finalRecStatus, med: domainModel.finalStatus.finalMedStatus },
      category: "A",
      reason: "FINAL_EQUALS_WIKI",
      triggerPhrase: domainModel.contextExplainability.triggerPhraseExcerpt,
      changesFinalStatus: false,
      reviewedRule: null
    });
  }
}

const overrideReport = {
  generatedAt: new Date().toISOString(),
  summary: {
    A: overrideRows.filter((row) => row.category === "A").length,
    B: overrideRows.filter((row) => row.category === "B").length,
    C: overrideRows.filter((row) => row.category === "C").length,
    D: overrideRows.filter((row) => row.category === "D").length
  },
  categories: {
    A: overrideRows.filter((row) => row.category === "A"),
    B: overrideRows.filter((row) => row.category === "B"),
    C: overrideRows.filter((row) => row.category === "C"),
    D: overrideRows.filter((row) => row.category === "D")
  }
};

fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
fs.writeFileSync(path.join(ARTIFACTS_DIR, "full-country-audit.json"), JSON.stringify(fullRows, null, 2));
fs.writeFileSync(path.join(ARTIFACTS_DIR, "notes-impact-countries.json"), JSON.stringify(notesImpactRows, null, 2));
fs.writeFileSync(path.join(ARTIFACTS_DIR, "status-context-diff-report.json"), JSON.stringify(overrideReport, null, 2));
fs.writeFileSync(path.join(ARTIFACTS_DIR, "popup-map-ssot-mismatch.json"), JSON.stringify(mismatchRows, null, 2));
fs.writeFileSync(path.join(ARTIFACTS_DIR, "status-override-report.json"), JSON.stringify(overrideReport, null, 2));
fs.writeFileSync(path.join(ARTIFACTS_DIR, "forbidden-status-pairs.json"), JSON.stringify(forbiddenStatusPairs, null, 2));

console.log(
  JSON.stringify(
    {
      rows: fullRows.length,
      mismatchTotal: mismatchRows.length,
      forbiddenPairTotal: forbiddenStatusPairs.length,
      notesImpactTotal: notesImpactRows.length,
      overrideSummary: overrideReport.summary
    },
    null,
    2
  )
);
