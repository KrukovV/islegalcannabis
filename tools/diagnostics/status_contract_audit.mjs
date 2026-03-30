#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  buildStatusContract,
  isSupportedStatusPair,
  resolveColorKeyFromContract,
  resolveMapCategoryFromPair
} from "../../apps/web/src/lib/statusPairMatrix.js";

const ROOT = process.cwd();
const LEGAL_SSOT_PATH = path.join(ROOT, "data", "legal_ssot", "legal_ssot.json");
const WIKI_CLAIMS_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");
const REPORT_JSON_PATH = path.join(ROOT, "Reports", "status_contract_audit.json");
const REPORT_TXT_PATH = path.join(ROOT, "Reports", "status_contract_audit.txt");

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

function colorSeverity(colorKey) {
  if (colorKey === "green") return 4;
  if (colorKey === "yellow") return 2;
  if (colorKey === "red") return 1;
  return 0;
}

function finalSeverity(rec, med) {
  return Math.max(STATUS_WEIGHT[rec] || 0, STATUS_WEIGHT[med] || 0);
}

const legalSsot = readJson(LEGAL_SSOT_PATH).entries || {};
const wikiClaims = readJson(WIKI_CLAIMS_PATH).items || {};
const geos = Array.from(new Set([...Object.keys(legalSsot), ...Object.keys(wikiClaims)])).sort();

const rows = [];
const popupMismatchRows = [];
const mapCategoryMismatchRows = [];
const impossiblePairRows = [];
const softerThanFinalRows = [];
const noteConflictRows = [];

for (const geo of geos) {
  const entry = legalSsot[geo] || {};
  const wiki = wikiClaims[geo] || {};
  const officialOverrideRec = entry.official_override_rec || null;
  const officialOverrideMed = entry.official_override_med || null;
  const contract = buildStatusContract({
    wikiRecStatus: wiki.wiki_rec || wiki.recreational_status,
    wikiMedStatus: wiki.wiki_med || wiki.medical_status,
    finalRecStatus: officialOverrideRec || wiki.wiki_rec || wiki.recreational_status,
    finalMedStatus: officialOverrideMed || wiki.wiki_med || wiki.medical_status,
    evidenceDeltaApproved: false
  });
  const popupRec = contract.finalRecStatus;
  const popupMed = contract.finalMedStatus;
  const mapCategory = resolveMapCategoryFromPair(contract.finalRecStatus, contract.finalMedStatus);
  const renderedColor = resolveColorKeyFromContract({ mapCategory });
  const notesOur = normalizeText(entry.notes || entry.extracted_facts?.notes);
  const notesWiki = normalizeText(wiki.notes || wiki.notes_text);
  const combinedNotes = [notesOur, notesWiki].filter(Boolean).join("\n\n");
  const triggers = collectTriggers(combinedNotes);
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

  const row = {
    geo,
    wikiRecStatus: contract.wikiRecStatus,
    wikiMedStatus: contract.wikiMedStatus,
    finalRecStatus: contract.finalRecStatus,
    finalMedStatus: contract.finalMedStatus,
    popupRec,
    popupMed,
    mapCategory,
    evidenceDelta,
    evidenceDeltaApproved: false,
    renderedColor,
    notesTriggerPhrases: triggers.map((item) => item.phrase).slice(0, 5)
  };
  rows.push(row);

  if (popupRec !== contract.finalRecStatus || popupMed !== contract.finalMedStatus) {
    popupMismatchRows.push(row);
  }
  if (mapCategory !== resolveMapCategoryFromPair(contract.finalRecStatus, contract.finalMedStatus)) {
    mapCategoryMismatchRows.push(row);
  }
  if (!isSupportedStatusPair(contract.finalRecStatus, contract.finalMedStatus)) {
    impossiblePairRows.push(row);
  }
  if (
    (evidenceDelta === "NONE" && colorSeverity(renderedColor) > finalSeverity(contract.finalRecStatus, contract.finalMedStatus)) ||
    (evidenceDelta === "NONE" && (popupRec !== contract.finalRecStatus || popupMed !== contract.finalMedStatus))
  ) {
    softerThanFinalRows.push(row);
  }
  if (evidenceDelta !== "NONE") {
    noteConflictRows.push(row);
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  totals: {
    rows: rows.length,
    popupMismatchTotal: popupMismatchRows.length,
    mapCategoryMismatchTotal: mapCategoryMismatchRows.length,
    impossiblePairTotal: impossiblePairRows.length,
    softerThanFinalTotal: softerThanFinalRows.length,
    noteConflictTotal: noteConflictRows.length
  },
  popupMismatchRows,
  mapCategoryMismatchRows,
  impossiblePairRows,
  softerThanFinalRows,
  noteConflictRows,
  rows
};

fs.mkdirSync(path.dirname(REPORT_JSON_PATH), { recursive: true });
fs.writeFileSync(REPORT_JSON_PATH, JSON.stringify(report, null, 2));
fs.writeFileSync(
  REPORT_TXT_PATH,
  [
    `STATUS_CONTRACT_AUDIT_ROWS=${rows.length}`,
    `STATUS_CONTRACT_POPUP_MISMATCH_TOTAL=${popupMismatchRows.length}`,
    `STATUS_CONTRACT_MAP_CATEGORY_MISMATCH_TOTAL=${mapCategoryMismatchRows.length}`,
    `STATUS_CONTRACT_IMPOSSIBLE_PAIR_TOTAL=${impossiblePairRows.length}`,
    `STATUS_CONTRACT_SOFTER_THAN_FINAL_TOTAL=${softerThanFinalRows.length}`,
    `STATUS_CONTRACT_NOTE_CONFLICT_TOTAL=${noteConflictRows.length}`,
    `STATUS_CONTRACT_NOTE_CONFLICT_SAMPLE=${noteConflictRows.slice(0, 30).map((row) => row.geo).join(",") || "-"}`,
    `STATUS_CONTRACT_AUDIT_JSON=${REPORT_JSON_PATH}`
  ].join("\n") + "\n"
);

console.log(fs.readFileSync(REPORT_TXT_PATH, "utf8").trim());
