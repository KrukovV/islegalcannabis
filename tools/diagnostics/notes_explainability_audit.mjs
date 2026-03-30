#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LEGAL_SSOT_PATH = path.join(ROOT, "data", "legal_ssot", "legal_ssot.json");
const WIKI_CLAIMS_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");
const REPORT_JSON_PATH = path.join(ROOT, "Reports", "notes_explainability_audit.json");
const REPORT_TXT_PATH = path.join(ROOT, "Reports", "notes_explainability_audit.txt");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "legal" || normalized === "allowed") return "Legal";
  if (normalized === "decriminalized" || normalized === "decrim") return "Decrim";
  if (normalized === "illegal") return "Illegal";
  if (normalized === "unenforced") return "Unenforced";
  if (normalized === "limited" || normalized === "restricted" || normalized === "medical") return "Limited";
  return "Unknown";
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

function resolveMapCategory(finalRecStatus, finalMedStatus) {
  if (finalRecStatus === "Legal" || finalRecStatus === "Decrim") return "LEGAL_OR_DECRIM";
  if (finalRecStatus === "Limited" || finalRecStatus === "Unenforced") return "LIMITED_OR_MEDICAL";
  if (finalMedStatus === "Legal" || finalMedStatus === "Limited" || finalMedStatus === "Unenforced") {
    return "LIMITED_OR_MEDICAL";
  }
  if (finalRecStatus === "Illegal" || finalMedStatus === "Illegal") return "ILLEGAL";
  return "UNKNOWN";
}

function mapCategorySeverity(category) {
  if (category === "LEGAL_OR_DECRIM") return 4;
  if (category === "LIMITED_OR_MEDICAL") return 2;
  if (category === "ILLEGAL") return 1;
  return 0;
}

function finalStatusSeverity(rec, med) {
  return Math.max(STATUS_WEIGHT[rec] || 0, STATUS_WEIGHT[med] || 0);
}

const legalSsot = readJson(LEGAL_SSOT_PATH).entries || {};
const wikiClaims = readJson(WIKI_CLAIMS_PATH).items || {};
const geos = Array.from(new Set([...Object.keys(legalSsot), ...Object.keys(wikiClaims)])).sort();

const rows = [];
const contractMismatches = [];
const noteConflicts = [];

for (const geo of geos) {
  const entry = legalSsot[geo] || {};
  const wiki = wikiClaims[geo] || {};
  const wikiRecStatus = normalizeStatus(wiki.wiki_rec || wiki.recreational_status);
  const wikiMedStatus = normalizeStatus(wiki.wiki_med || wiki.medical_status);
  const officialOverrideRec = normalizeStatus(entry.official_override_rec);
  const officialOverrideMed = normalizeStatus(entry.official_override_med);
  const finalRecStatus = officialOverrideRec !== "Unknown" ? officialOverrideRec : wikiRecStatus;
  const finalMedStatus = officialOverrideMed !== "Unknown" ? officialOverrideMed : wikiMedStatus;
  const mapCategory = resolveMapCategory(finalRecStatus, finalMedStatus);
  const notesOur = normalizeText(entry.notes || entry.extracted_facts?.notes);
  const notesWiki = normalizeText(wiki.notes || wiki.notes_text);
  const combinedNotes = [notesOur, notesWiki].filter(Boolean).join("\n\n");
  const triggers = collectTriggers(combinedNotes);
  const impliedRec = highestImpliedStatus(triggers, "rec");
  const impliedMed = highestImpliedStatus(triggers, "med");
  const recDelta = compareEvidence(finalRecStatus, impliedRec);
  const medDelta = compareEvidence(finalMedStatus, impliedMed);
  const evidenceDelta =
    recDelta === "STRONG_CONFLICT" || medDelta === "STRONG_CONFLICT"
      ? "STRONG_CONFLICT"
      : recDelta === "SOFT_CONFLICT" || medDelta === "SOFT_CONFLICT"
        ? "SOFT_CONFLICT"
        : "NONE";
  const row = {
    geo,
    wikiRecStatus,
    wikiMedStatus,
    finalRecStatus,
    finalMedStatus,
    mapCategory,
    notesTriggerPhrases: triggers.map((item) => item.phrase).slice(0, 5),
    evidenceDelta,
    evidenceDeltaApproved: false
  };
  rows.push(row);

  if (mapCategorySeverity(mapCategory) > finalStatusSeverity(finalRecStatus, finalMedStatus)) {
    contractMismatches.push({
      geo,
      finalRecStatus,
      finalMedStatus,
      mapCategory
    });
  }
  if (evidenceDelta !== "NONE") {
    noteConflicts.push(row);
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  totals: {
    rows: rows.length,
    contractMismatchTotal: contractMismatches.length,
    noteConflictTotal: noteConflicts.length
  },
  contractMismatches,
  noteConflicts,
  rows
};

fs.mkdirSync(path.dirname(REPORT_JSON_PATH), { recursive: true });
fs.writeFileSync(REPORT_JSON_PATH, JSON.stringify(report, null, 2));
fs.writeFileSync(
  REPORT_TXT_PATH,
  [
    `NOTES_EXPLAINABILITY_AUDIT_ROWS=${rows.length}`,
    `NOTES_EXPLAINABILITY_CONTRACT_MISMATCH_TOTAL=${contractMismatches.length}`,
    `NOTES_EXPLAINABILITY_NOTE_CONFLICT_TOTAL=${noteConflicts.length}`,
    `NOTES_EXPLAINABILITY_NOTE_CONFLICT_SAMPLE=${noteConflicts.slice(0, 20).map((row) => row.geo).join(",") || "-"}`,
    `NOTES_EXPLAINABILITY_AUDIT_JSON=${REPORT_JSON_PATH}`
  ].join("\n") + "\n"
);

console.log(fs.readFileSync(REPORT_TXT_PATH, "utf8").trim());
