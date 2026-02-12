#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LEGALITY_PATH = path.join(ROOT, "data", "wiki", "ssot_legality_table.json");
const CLAIMS_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");
const BASELINE_PATH = path.join(ROOT, "Reports", "coverage.baseline.json");

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return readJson(BASELINE_PATH);
}

function writeBaseline(payload) {
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + "\n");
}

function exitWith(reason, code) {
  console.log(`WIKI_COVERAGE_GUARD=${reason}`);
  process.exit(code);
}

try {
  const legality = readJson(LEGALITY_PATH);
  if (!legality || !Array.isArray(legality.rows)) {
    console.log(`WIKI_COVERAGE_ERROR=missing_legality_ssot path=${LEGALITY_PATH}`);
    exitWith("FAIL", 2);
  }
  const legalityRows = legality.rows.length;
  if (legalityRows === 0) {
    console.log("WIKI_COVERAGE_ERROR=legality_rows_zero");
    exitWith("FAIL", 2);
  }

  const claims = readJson(CLAIMS_PATH) || {};
  const claimsItems = claims.items && typeof claims.items === "object" ? claims.items : {};
  const claimsCount = Object.keys(claimsItems).length;
  let notesPresent = 0;
  for (const entry of Object.values(claimsItems)) {
    const notes = String(entry?.notes_text || "").trim();
    if (notes) notesPresent += 1;
  }

  console.log(`WIKI_COVERAGE_LEGALITY_ROWS=${legalityRows}`);
  console.log(`WIKI_COVERAGE_CLAIMS=${claimsCount}`);
  console.log(`WIKI_COVERAGE_NOTES=${notesPresent}`);
  console.log(`WIKI_COVERAGE_BASELINE_PATH=${BASELINE_PATH}`);

  const snapshot = {
    legality_rows: legalityRows,
    claims_count: claimsCount,
    notes_present: notesPresent
  };

  if (!fs.existsSync(BASELINE_PATH)) {
    if (process.env.WIKI_COVERAGE_BASELINE_INIT === "1") {
      writeBaseline(snapshot);
      console.log("WIKI_COVERAGE_BASELINE_INIT=1");
      console.log(`WIKI_COVERAGE_BASELINE_LEGALITY_ROWS=${legalityRows}`);
      console.log(`WIKI_COVERAGE_BASELINE_CLAIMS=${claimsCount}`);
      console.log(`WIKI_COVERAGE_BASELINE_NOTES=${notesPresent}`);
      exitWith("PASS", 0);
    }
    console.log("WIKI_COVERAGE_ERROR=baseline_missing");
    exitWith("FAIL", 2);
  }

  const baseline = readBaseline() || {};
  const baseLegality = Number(baseline.legality_rows || 0);
  const baseClaims = Number(baseline.claims_count || 0);
  const baseNotes = Number(baseline.notes_present || 0);
  console.log(`WIKI_COVERAGE_BASELINE_LEGALITY_ROWS=${baseLegality}`);
  console.log(`WIKI_COVERAGE_BASELINE_CLAIMS=${baseClaims}`);
  console.log(`WIKI_COVERAGE_BASELINE_NOTES=${baseNotes}`);

  if (process.env.WIKI_COVERAGE_BASELINE_BUMP === "1") {
    writeBaseline(snapshot);
    console.log("WIKI_COVERAGE_BASELINE_BUMP=1");
    exitWith("PASS", 0);
  }

  if (claimsCount < legalityRows || notesPresent < legalityRows) {
    console.log("WIKI_COVERAGE_ERROR=below_legality_rows");
    exitWith("FAIL", 1);
  }

  const allow = process.env.WIKI_COVERAGE_SHRINK_OK === "1";
  const reason = String(process.env.WIKI_COVERAGE_SHRINK_REASON || "").trim();

  if (claimsCount < baseClaims || notesPresent < baseNotes || legalityRows < baseLegality) {
    if (!allow) {
      console.log("WIKI_COVERAGE_ERROR=shrink_detected");
      exitWith("FAIL", 1);
    }
    if (!reason) {
      console.log("WIKI_COVERAGE_ERROR=shrink_allowed_but_reason_missing");
      exitWith("FAIL", 3);
    }
    console.log("WIKI_COVERAGE_ALLOW_SHRINK=1");
    console.log(`WIKI_COVERAGE_SHRINK_REASON=${reason}`);
  }

  exitWith("PASS", 0);
} catch (error) {
  console.log(`WIKI_COVERAGE_ERROR=${error instanceof Error ? error.message : String(error)}`);
  exitWith("FAIL", 2);
}
