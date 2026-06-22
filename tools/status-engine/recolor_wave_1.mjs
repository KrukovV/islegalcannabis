#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const COUNTRY_DIR = path.join(DATA_DIR, "countries");
const STATUS_DIR = path.join(DATA_DIR, "status-engine");
const REPORT_DIR = path.join(ROOT, "Reports", "status-engine");
const BEFORE_PATH = path.join(STATUS_DIR, "status_snapshot_before.json");
const AFTER_PATH = path.join(STATUS_DIR, "status_snapshot_after.json");
const SSOT_PATH = path.join(STATUS_DIR, "status_ssot_v9.json");
const MANUAL_REVIEW_OVERRIDES_PATH = path.join(STATUS_DIR, "manual_review_overrides.json");
const CHANGE_REPORT_PATH = path.join(REPORT_DIR, "recolor-wave-1.md");
const REVIEW_REPORT_PATH = path.join(REPORT_DIR, "status-review-required.md");
const FIRST_WAVE_PATH = path.join(REPORT_DIR, "first-validation-wave.md");
const SECOND_WAVE_PATH = path.join(REPORT_DIR, "second-validation-wave.md");
const CONTROL_PATH = path.join(REPORT_DIR, "control-countries.md");

const SOFT_PATTERNS = [
  /\brarely enforced\b/i,
  /\brarely prosecuted\b/i,
  /\bconvictions are rare\b/i,
  /\boften not enforced\b/i,
  /\boften unenforced\b/i,
  /\blaw often unenforced\b/i,
  /\bnot strictly enforced\b/i,
  /\bopportunistically enforced\b/i,
  /\benforced opportunistically\b/i,
  /\btolerated possession\b/i,
  /\bpossession is tolerated\b/i,
  /\bpersonal possession is tolerated\b/i,
  /\bpolice do not normally prosecute users\b/i,
  /\bpolice do not harass users\b/i,
  /\bopenly sold despite prohibition\b/i,
  /\bpublicly offer\b/i,
  /\bprohibition is lax\b/i,
  /\blax and enforced opportunistically\b/i,
  /\bunenforced\b/i
];

const STRICT_PATTERNS = [
  /\bstrictly enforced\b/i,
  /\bstrict enforcement\b/i,
  /\bzero tolerance\b/i,
  /\bmandatory minimum\b/i,
  /\bdeath penalty\b/i,
  /\bcapital punishment\b/i
];

const CONTROL_GEOS = ["AL", "IR", "KH", "DZ", "AO", "AF", "BD", "BY", "AM", "AR", "AU", "AT", "AD", "BW", "BJ", "BI"];
const STATUS_COLORS = new Set(["GREEN", "YELLOW", "RED"]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function mdEscape(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

function readCountryPages() {
  const index = readJson(path.join(DATA_DIR, "index.json"));
  const byGeo = new Map();
  const byCode = new Map();
  for (const code of index) {
    const file = path.join(COUNTRY_DIR, `${code}.json`);
    if (!fs.existsSync(file)) continue;
    const data = readJson(file);
    const geo = String(data.geo_code || data.iso2 || code).toUpperCase();
    byGeo.set(geo, data);
    byCode.set(code, data);
  }
  return { index, byGeo, byCode };
}

function readNameIndex() {
  const file = path.join(ROOT, "apps", "web", "src", "lib", "countryNames.snapshot.json");
  if (!fs.existsSync(file)) return new Map();
  const payload = readJson(file);
  const names = new Map();
  for (const item of payload.countries || []) {
    if (item?.cca2) names.set(String(item.cca2).toUpperCase(), item?.name?.common || item.cca2);
  }
  return names;
}

function readKnowledgeIndex() {
  const file = path.join(DATA_DIR, "cannabis_profiles", "knowledge_db.json");
  if (!fs.existsSync(file)) return new Map();
  const payload = readJson(file);
  return new Map((payload.entries || []).map((entry) => [String(entry.geo || "").toUpperCase(), entry]));
}

function readManualReviewOverrides() {
  if (!fs.existsSync(MANUAL_REVIEW_OVERRIDES_PATH)) return new Map();
  const payload = readJson(MANUAL_REVIEW_OVERRIDES_PATH);
  return new Map(
    Object.entries(payload.entries || {}).map(([geo, entry]) => [String(geo || "").toUpperCase(), entry])
  );
}

function sourceText(data, knowledge) {
  if (!data) return "";
  return [
    data.notes_normalized,
    data.notes_raw,
    data.facts?.possession_limit,
    data.facts?.cultivation,
    data.facts?.penalty,
    ...(data.legal_model?.signals?.explain || []),
    ...(data.legal_model?.distribution?.flags || []),
    ...(data.legal_model?.enforcement_flags || []),
    ...(data.legal_model?.signals?.sources || []).map((item) => item.title),
    ...(data.sources?.citations || []).map((item) => item.title),
    ...(knowledge?.enforcementReality || []),
    ...(knowledge?.notes || [])
  ]
    .filter(Boolean)
    .join(" ");
}

function hasPattern(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function hasAny(value, probes) {
  const folded = String(value || "").toLowerCase();
  return probes.some((probe) => folded.includes(probe));
}

function normalizeRec(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "LEGAL") return "LEGAL";
  if (["ILLEGAL", "DECRIMINALIZED", "DECRIM", "TOLERATED", "MIXED", "LIMITED", "UNENFORCED"].includes(normalized)) return "ILLEGAL";
  return null;
}

function normalizeMedFromValues(statusValue, rawValue, text) {
  const status = String(statusValue || "").trim().toUpperCase();
  const raw = String(rawValue || "").trim().toUpperCase();
  const positive =
    /\bmedical (?:use|cannabis|marijuana).{0,80}\b(?:legalized|legalised|allowed|approved|regulated|licensed)\b/i.test(text) ||
    /\b(?:legalized|legalised|allowed|approved|regulated|licensed).{0,80}\bmedical (?:use|cannabis|marijuana)\b/i.test(text) ||
    /\blegal for medical use\b/i.test(text) ||
    /\bmedical (?:use|cannabis|marijuana) is legal\b/i.test(text) ||
    /\bmedical and industrial purposes\b/i.test(text);
  const limited =
    /\brule:\s*medical_limited\b/i.test(text) ||
    /\blimited medical\b/i.test(text) ||
    /\bcbd oil\b/i.test(text) ||
    /\bcannabidiol\b/i.test(text) ||
    /\blow[- ]thc\b/i.test(text) ||
    /\bhemp extract\b/i.test(text) ||
    /\bmedical use is limited\b/i.test(text) ||
    /\bspecial permit\b/i.test(text) ||
    /\bunless prescribed by a licensed medical professional\b/i.test(text) ||
    /\bnon-psychoactive cannabidiol\b/i.test(text);
  const negative = hasAny(text, [
    "medical cannabis is illegal",
    "medical marijuana is illegal",
    "medical use is illegal",
    "medical cannabis is not allowed",
    "not allowed for medical purposes",
    "does not have a comprehensive medical cannabis program",
    "no comprehensive medical cannabis program",
    "no medical cannabis",
    "continues to ban medical"
  ]);
  const reason = [];
  const conflicts = positive && negative ? ["medical negative and positive signals conflict"] : [];
  if (status === "LEGAL" || raw === "LEGAL") {
    reason.push("medical structured status is legal");
    return { value: "REGULATED", reason, missing: [], conflicts };
  }
  if (limited) {
    reason.push(status === "LIMITED" || raw === "LIMITED" ? "medical structured status is limited" : "medical source text says limited/CBD-only access");
    return { value: "LIMITED", reason, missing: [], conflicts };
  }
  if (positive) {
    reason.push("medical source text says legal or regulated");
    return { value: "REGULATED", reason, missing: [], conflicts };
  }
  if (status === "LIMITED" || raw === "LIMITED" || limited) {
    reason.push(status === "LIMITED" || raw === "LIMITED" ? "medical structured status is limited" : "medical source text says limited/CBD-only access");
    return { value: "LIMITED", reason, missing: [], conflicts };
  }
  if (status === "ILLEGAL" || raw === "ILLEGAL" || negative) {
    reason.push(status === "ILLEGAL" || raw === "ILLEGAL" ? "medical structured status is none/illegal" : "medical source text says none/illegal");
    return { value: "NONE", reason, missing: [], conflicts };
  }
  return { value: null, reason, missing: ["medical"], conflicts };
}

function normalizeEnforcement(data, text, recreational) {
  const recStatus = String(data?.legal_model?.recreational?.status || "").trim().toUpperCase();
  const recEnforcement = String(data?.legal_model?.recreational?.enforcement || "").trim().toUpperCase();
  const enforcementLevel = String(data?.legal_model?.signals?.enforcement_level || "").trim().toLowerCase();
  const flags = data?.legal_model?.enforcement_flags || [];
  const penalties = data?.legal_model?.signals?.penalties;
  const softByText = hasPattern(text, SOFT_PATTERNS);
  const softByStructured =
    recStatus === "DECRIMINALIZED" ||
    recStatus === "TOLERATED" ||
    enforcementLevel === "rare" ||
    enforcementLevel === "unenforced" ||
    flags.includes("weak_enforcement");
  if (recreational === "LEGAL") {
    return { value: "SOFT", reason: ["recreational legal means no strict recreational prohibition is evaluated"], missing: [], conflicts: [], signals: ["RECREATIONAL_LEGAL"] };
  }
  if (softByStructured || softByText) {
    return {
      value: "SOFT",
      reason: ["soft enforcement signal present"],
      missing: [],
      conflicts: [],
      signals: [softByStructured ? "SOFT_STRUCTURED_SIGNAL" : null, softByText ? "SOFT_ENFORCEMENT_TEXT" : null].filter(Boolean)
    };
  }
  if (
    hasPattern(text, STRICT_PATTERNS) ||
    recEnforcement === "STRICT" ||
    enforcementLevel === "active" ||
    penalties?.possession?.prison ||
    penalties?.possession?.arrest ||
    penalties?.prison ||
    penalties?.arrest
  ) {
    return { value: "STRICT", reason: ["strict enforcement signal present"], missing: [], conflicts: [], signals: ["STRICT_SIGNAL"] };
  }
  return { value: null, reason: [], missing: ["enforcement"], conflicts: [], signals: [] };
}

function evaluate(input) {
  const reviewRequired = input.missingSignal.length > 0 || input.conflictingFacts.length > 0;
  if (reviewRequired) return { ...input, color: "RED", proposedColor: "UNCONFIRMED", triggeredRule: "STATUS_REVIEW_REQUIRED", reviewRequired, reason: [...input.reason, "STATUS_REVIEW_REQUIRED"] };
  if (input.recreational === "LEGAL") return { ...input, color: "GREEN", proposedColor: "GREEN", triggeredRule: "GREEN_RECREATIONAL_LEGAL", reviewRequired: false, reason: [...input.reason, "GREEN: recreational == LEGAL"] };
  if (input.medical === "REGULATED") return { ...input, color: "GREEN", proposedColor: "GREEN", triggeredRule: "GREEN_MEDICAL_REGULATED", reviewRequired: false, reason: [...input.reason, "GREEN: medical == REGULATED"] };
  if (input.recreational === "ILLEGAL" && input.medical === "LIMITED") return { ...input, color: "YELLOW", proposedColor: "YELLOW", triggeredRule: "YELLOW_MEDICAL_LIMITED", reviewRequired: false, reason: [...input.reason, "YELLOW: medical == LIMITED"] };
  if (input.recreational === "ILLEGAL" && input.enforcement === "SOFT") return { ...input, color: "YELLOW", proposedColor: "YELLOW", triggeredRule: "YELLOW_SOFT_ENFORCEMENT", reviewRequired: false, reason: [...input.reason, "YELLOW: enforcement == SOFT"] };
  return { ...input, color: "RED", proposedColor: "RED", triggeredRule: "RED_STRICT_NONE", reviewRequired: false, reason: [...input.reason, "RED: recreational == ILLEGAL, medical == NONE, enforcement == STRICT"] };
}

function deriveV9(row, data, knowledge) {
  const text = sourceText(data, knowledge);
  const rec = normalizeRec(data?.legal_model?.recreational?.status || row?.rec_status);
  const med = normalizeMedFromValues(data?.legal_model?.medical?.status || row?.med_status, data?.legal_model?.medical?.raw_status || row?.med_status, text);
  const enforcement = normalizeEnforcement(data, text, rec);
  const missingSignal = [
    ...(rec ? [] : ["recreational"]),
    ...med.missing,
    ...enforcement.missing
  ];
  return evaluate({
    recreational: rec,
    medical: med.value,
    enforcement: enforcement.value,
    reason: [
      ...(rec ? [`recreational=${rec}`] : []),
      ...med.reason,
      ...enforcement.reason
    ],
    missingSignal,
    conflictingFacts: [...med.conflicts, ...enforcement.conflicts],
    triggeredSignals: enforcement.signals,
    sourceUrl: data?.sources?.legal || row?.wiki_page_url || null,
    confidence: missingSignal.length ? "LOW" : enforcement.signals.includes("SOFT_ENFORCEMENT_TEXT") ? "HIGH" : "MEDIUM"
  });
}

function deriveManualOverrideV9(geo, override) {
  const recreational = override?.recreational || null;
  const medical = override?.medical || null;
  const enforcement = override?.enforcement || null;
  const missingSignal = [
    ...(recreational ? [] : ["recreational"]),
    ...(medical ? [] : ["medical"]),
    ...(enforcement ? [] : ["enforcement"])
  ];
  return evaluate({
    recreational,
    medical,
    enforcement,
    reason: [
      `manual_review_override=${geo}`,
      ...(override?.reason ? [override.reason] : []),
      ...(recreational ? [`recreational=${recreational}`] : []),
      ...(medical ? [`medical=${medical}`] : []),
      ...(enforcement ? [`enforcement=${enforcement}`] : [])
    ],
    missingSignal,
    conflictingFacts: [],
    triggeredSignals: ["MANUAL_REVIEW_OVERRIDE"],
    sourceUrl: override?.sources?.[0] || null,
    confidence: missingSignal.length ? "LOW" : "HIGH"
  });
}

function oldColorFromPage(data) {
  const rec = String(data?.legal_model?.recreational?.status || "").toUpperCase();
  const med = String(data?.legal_model?.medical?.status || "").toUpperCase();
  const text = sourceText(data, null);
  const weak =
    data?.legal_model?.signals?.enforcement_level === "rare" ||
    data?.legal_model?.signals?.enforcement_level === "unenforced" ||
    (data?.legal_model?.enforcement_flags || []).includes("weak_enforcement") ||
    hasPattern(text, SOFT_PATTERNS);
  if (rec === "LEGAL" || rec === "DECRIMINALIZED" || rec === "TOLERATED") return "GREEN";
  if (med === "LEGAL" || med === "LIMITED" || weak) return "YELLOW";
  if (rec === "ILLEGAL" || med === "ILLEGAL") return "RED";
  return "UNKNOWN";
}

function oldColorFromSnapshot(row) {
  const rec = String(row?.rec_status || "").toLowerCase();
  const med = String(row?.med_status || "").toLowerCase();
  if (rec === "legal" || rec === "decrim" || rec === "decriminalized") return "GREEN";
  if (rec === "unenforced" || med === "legal" || med === "limited" || med === "unenforced") return "YELLOW";
  if (rec === "illegal" || med === "illegal") return "RED";
  return "UNKNOWN";
}

function displayName(geo, data, nameIndex) {
  if (data?.name) return data.name;
  if (geo.startsWith("US-")) return geo;
  return nameIndex.get(geo) || geo;
}

function buildUniverse(snapshotRows, pagesByGeo) {
  const rows = new Map();
  for (const row of snapshotRows) rows.set(String(row.geo || "").toUpperCase(), row);
  for (const geo of pagesByGeo.keys()) {
    if (!rows.has(geo)) rows.set(geo, { geo, rec_status: null, med_status: null, wiki_page_url: null });
  }
  return [...rows.values()].sort((left, right) => String(left.geo).localeCompare(String(right.geo)));
}

function table(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(mdEscape).join(" | ")} |`)
  ].join("\n");
}

function main() {
  fs.mkdirSync(STATUS_DIR, { recursive: true });
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const generatedAt = new Date().toISOString();
  const { index, byGeo, byCode } = readCountryPages();
  const snapshot = readJson(path.join(DATA_DIR, "ssot_snapshots", "latest.json"));
  const nameIndex = readNameIndex();
  const knowledgeIndex = readKnowledgeIndex();
  const manualReviewOverrides = readManualReviewOverrides();
  const universe = buildUniverse(snapshot.rows || [], byGeo);

  const before = [];
  const after = [];
  const ssotEntries = [];
  const changes = [];
  const reviews = [];
  const byGeoResult = new Map();

  for (const row of universe) {
    const geo = String(row.geo || "").toUpperCase();
    const data = byGeo.get(geo) || null;
    const knowledge = knowledgeIndex.get(geo) || null;
    const manualReviewOverride = manualReviewOverrides.get(geo) || null;
    const name = displayName(geo, data, nameIndex);
    const oldColor = data ? oldColorFromPage(data) : oldColorFromSnapshot(row);
    const oldStatus = data
      ? `${data.legal_model.recreational.status}/${data.legal_model.medical.status}`
      : `${row.rec_status || "Unknown"}/${row.med_status || "Unknown"}`;
    const v9 = manualReviewOverride ? deriveManualOverrideV9(geo, manualReviewOverride) : deriveV9(row, data, knowledge);
    const newColor = v9.reviewRequired && STATUS_COLORS.has(oldColor) ? oldColor : v9.color;
    const result = { geo, name, oldColor, oldStatus, newColor, ...v9 };
    byGeoResult.set(geo, result);
    before.push({ id: geo, name, oldStatus, oldColor });
    after.push({
      id: geo,
      name,
      recreational: v9.recreational,
      medical: v9.medical,
      enforcement: v9.enforcement,
      newColor,
      proposedColor: v9.proposedColor,
      reviewRequired: v9.reviewRequired,
      triggeredRule: v9.triggeredRule,
      reason: v9.reason
    });
    ssotEntries.push({
      id: geo,
      name,
      recreational: v9.recreational,
      medical: v9.medical,
      enforcement: v9.enforcement,
      color: newColor,
      reviewRequired: v9.reviewRequired,
      sourceUrl: v9.sourceUrl
    });
    if (!v9.reviewRequired && oldColor !== newColor) changes.push(result);
    if (v9.reviewRequired) reviews.push(result);
  }

  writeJson(BEFORE_PATH, { generated_at: generatedAt, entries: before });
  writeJson(AFTER_PATH, { generated_at: generatedAt, entries: after });
  writeJson(SSOT_PATH, {
    generated_at: generatedAt,
    model: "STATUS_ENGINE_V9",
    allowed_fields: ["recreational", "medical", "enforcement"],
    entries: ssotEntries
  });

  const firstCodes = index.slice(0, 30);
  const secondCodes = index.slice(30, 60);
  const firstRows = firstCodes.map((code) => {
    const data = byCode.get(code);
    const result = byGeoResult.get(String(data?.geo_code || data?.iso2 || code).toUpperCase());
    return [result?.name || code, result?.oldColor, result?.newColor, result?.recreational, result?.medical, result?.enforcement, (result?.reason || []).join(" ")];
  });
  const secondRows = secondCodes.map((code) => {
    const data = byCode.get(code);
    const result = byGeoResult.get(String(data?.geo_code || data?.iso2 || code).toUpperCase());
    return [result?.name || code, result?.newColor, (result?.reason || []).join(" "), result?.confidence];
  });
  const controlRows = CONTROL_GEOS.map((geo) => {
    const result = byGeoResult.get(geo);
    return [result?.name || geo, result?.newColor || "UNCONFIRMED", result?.recreational, result?.medical, result?.enforcement, result?.triggeredRule, (result?.reason || []).join(" ")];
  });

  const changeReport = [
    "# Status Engine Recolor Wave #1",
    "",
    `Generated: ${generatedAt}`,
    "",
    `Universe: ${universe.length}`,
    `Changed after reviewed data/evaluator pass: ${changes.length}`,
    `STATUS_REVIEW_REQUIRED: ${reviews.length}`,
    "",
    table(["Country", "Old Color", "New Color", "Reason", "Triggered Rule"], changes.map((item) => [item.name, item.oldColor, item.newColor, item.reason.join(" "), item.triggeredRule])),
    ""
  ].join("\n");
  fs.writeFileSync(CHANGE_REPORT_PATH, changeReport, "utf8");

  const reviewReport = [
    "# STATUS_REVIEW_REQUIRED",
    "",
    `Generated: ${generatedAt}`,
    "",
    table(
      ["Country", "Current Color", "Suggested Color", "Conflicting Facts", "Missing Data", "Official Sources", "Confidence"],
      reviews.map((item) => [
        item.name,
        item.oldColor,
        item.proposedColor,
        item.conflictingFacts.join("; ") || "-",
        item.missingSignal.join(", ") || "-",
        item.sourceUrl || "-",
        item.confidence
      ])
    ),
    ""
  ].join("\n");
  fs.writeFileSync(REVIEW_REPORT_PATH, reviewReport, "utf8");

  fs.writeFileSync(FIRST_WAVE_PATH, ["# First Validation Wave", "", table(["Country", "Old Color", "New Color", "Recreational", "Medical", "Enforcement", "Reason"], firstRows), ""].join("\n"), "utf8");
  fs.writeFileSync(SECOND_WAVE_PATH, ["# Second Validation Wave", "", table(["Country", "Calculated Color", "Reason", "Confidence"], secondRows), ""].join("\n"), "utf8");
  fs.writeFileSync(CONTROL_PATH, ["# Control Countries", "", table(["Country", "Color", "Recreational", "Medical", "Enforcement", "Triggered Rule", "Reason"], controlRows), ""].join("\n"), "utf8");

  console.log(`STATUS_ENGINE_RECOLOR_WAVE_1=PASS universe=${universe.length} changed=${changes.length} review=${reviews.length}`);
  console.log(`STATUS_ENGINE_BEFORE=${path.relative(ROOT, BEFORE_PATH)}`);
  console.log(`STATUS_ENGINE_AFTER=${path.relative(ROOT, AFTER_PATH)}`);
  console.log(`STATUS_ENGINE_RECOLOR_REPORT=${path.relative(ROOT, CHANGE_REPORT_PATH)}`);
  console.log(`STATUS_ENGINE_REVIEW_REPORT=${path.relative(ROOT, REVIEW_REPORT_PATH)}`);
}

main();
