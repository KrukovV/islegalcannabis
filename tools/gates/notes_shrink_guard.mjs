#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  classifyNotesForCoverage,
  isMinOnlyOk,
  isPlaceholderNote,
  normalizeNotesKind,
  normalizeText
} from "../wiki/notes_quality.mjs";

const ROOT = process.cwd();
const BASELINE_PATH = path.join(ROOT, "Reports", "notes_quality.baseline.json");
const SSOT_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");
const REGRESS_PATH = path.join(ROOT, "Reports", "notes_regress.ssot.json");
const MIN_ONLY_PATH = path.join(ROOT, "Reports", "notes_min_only.txt");
const COVERAGE_MIN_LEN = 80;
const STRICT_GEOS = ["RU", "RO", "AU", "DE", "SG", "US-CA", "CA", "GH"];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeBaseline(payload) {
  const baseline = {
    ...payload,
    created_at: new Date().toISOString()
  };
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
}

function exitWith(reason, code) {
  console.log(`STOP_REASON=${reason}`);
  process.exit(code);
}

try {
  if (!fs.existsSync(SSOT_PATH)) {
    console.log(`NOTES_ERROR=missing_ssot path=${SSOT_PATH}`);
    exitWith("ERROR", 2);
  }
  const ssot = readJson(SSOT_PATH);
  const claims = ssot?.items && typeof ssot.items === "object" ? ssot.items : {};
  let totalGeo = 0;
  let withNotes = 0;
  let empty = 0;
  let placeholder = 0;
  let weak = 0;
  let ok = 0;
  let kindRich = 0;
  let kindMinOnly = 0;
  let strictWeak = 0;
  let minLen = null;
  const weakGeos = [];
  const minOnlyGeos = [];
  let minOnlyRegressions = 0;
  const minOnlyRegressGeos = [];
  for (const [geo, claim] of Object.entries(claims)) {
    totalGeo += 1;
    const notesText = normalizeText(claim?.notes_text || "");
    const kind = normalizeNotesKind(claim);
    const notesRaw = String(claim?.notes_raw || "");
    const placeholderNote = notesText ? isPlaceholderNote(notesText, notesRaw, kind) : false;
    const isEmpty = !notesText;
    if (isEmpty) {
      empty += 1;
      continue;
    }
    const notesLen = notesText.length;
    if (minLen === null || notesLen < minLen) {
      minLen = notesLen;
    }
    const coverageClass = classifyNotesForCoverage(claim, COVERAGE_MIN_LEN, { allowNumericSignal: true });
    withNotes += 1;
    if (placeholderNote) {
      placeholder += 1;
    }
    if (kind === "MIN_ONLY") {
      if (isMinOnlyOk(claim)) {
        kindMinOnly += 1;
        minOnlyGeos.push(String(geo || "").toUpperCase());
      } else {
        if (STRICT_GEOS.includes(String(geo || "").toUpperCase())) strictWeak += 1;
      }
    }
    if (kind === "RICH") {
      kindRich += 1;
      ok += 1;
    }
    if (coverageClass.isWeak) {
      weak += 1;
      if (weakGeos.length < 20) weakGeos.push(String(geo || "").toUpperCase());
    }
  }

  console.log(`NOTES_TOTAL_GEO=${totalGeo}`);
  console.log(`NOTES_TOTAL=${withNotes}`);
  console.log(`NOTES_MINLEN=${minLen === null ? 0 : minLen}`);
  console.log(`NOTES_CURRENT_WITH_NOTES=${withNotes}`);
  console.log(`NOTES_CURRENT_OK=${ok}`);
  console.log(`NOTES_CURRENT_EMPTY=${empty}`);
  console.log(`NOTES_CURRENT_PLACEHOLDER=${placeholder}`);
  console.log(`NOTES_CURRENT_WEAK=${weak}`);
  console.log(`NOTES_CURRENT_KIND_RICH=${kindRich}`);
  console.log(`NOTES_CURRENT_KIND_MIN_ONLY=${kindMinOnly}`);
  console.log(`NOTES_CURRENT_STRICT_WEAK=${strictWeak}`);
  console.log(`NOTES_WEAK_COUNT=${weak}`);
  if (weakGeos.length > 0) {
    console.log(`NOTES_WEAK_GEOS=${weakGeos.join(",")}`);
  }
  if (minOnlyGeos.length > 0) {
    const sample = minOnlyGeos.slice(0, 20);
    console.log(`NOTES_MIN_ONLY_GEOS=${sample.join(",")}`);
    try {
      fs.writeFileSync(MIN_ONLY_PATH, `${minOnlyGeos.join("\n")}\n`, "utf8");
    } catch {
      // ignore write errors
    }
  }

  if (fs.existsSync(REGRESS_PATH)) {
    try {
      const payload = readJson(REGRESS_PATH);
      const regressions = Array.isArray(payload?.regressions) ? payload.regressions : [];
      for (const entry of regressions) {
        const geo = String(entry?.geo || "").toUpperCase();
        const reason = String(entry?.reason || "");
        if (!geo) continue;
        if (!STRICT_GEOS.includes(geo)) continue;
        if (reason === "MIN_ONLY_REGRESS") {
          minOnlyRegressions += 1;
          if (minOnlyRegressGeos.length < 20) minOnlyRegressGeos.push(geo);
        }
      }
    } catch {
      // ignore
    }
  }
  console.log(`NOTES_MIN_ONLY_REGRESSIONS=${minOnlyRegressions}`);
  if (minOnlyRegressGeos.length > 0) {
    console.log(`NOTES_MIN_ONLY_REGRESSION_GEOS=${minOnlyRegressGeos.join(",")}`);
  }

  if (!fs.existsSync(BASELINE_PATH)) {
    if (process.env.NOTES_BASELINE_INIT === "1") {
      writeBaseline({
        total_geo: totalGeo,
        with_notes: withNotes,
        ok,
        empty,
        placeholder,
        weak,
        kind_rich: kindRich,
        kind_min_only: kindMinOnly,
        strict_weak: strictWeak
      });
      console.log(`NOTES_BASELINE_WITH_NOTES=${withNotes}`);
      console.log(`NOTES_BASELINE_OK=${ok}`);
      console.log(`NOTES_BASELINE_EMPTY=${empty}`);
      console.log(`NOTES_BASELINE_PLACEHOLDER=${placeholder}`);
      console.log(`NOTES_BASELINE_WEAK=${weak}`);
      console.log(`NOTES_BASELINE_KIND_RICH=${kindRich}`);
      console.log(`NOTES_BASELINE_KIND_MIN_ONLY=${kindMinOnly}`);
      console.log(`NOTES_BASELINE_STRICT_WEAK=${strictWeak}`);
      console.log("NOTES_QUALITY_GUARD=PASS");
      exitWith("BASELINE_INIT", 0);
    }
    console.log("NOTES_BASELINE=missing");
    exitWith("BASELINE_MISSING", 0);
  }

  const baselineRaw = readJson(BASELINE_PATH);
  const baseWithNotes = Number(baselineRaw?.with_notes || 0) || 0;
  const baseOk = Number(baselineRaw?.ok || 0) || 0;
  const baseEmpty = Number(baselineRaw?.empty || 0) || 0;
  const basePlaceholder = Number(baselineRaw?.placeholder || 0) || 0;
  const baseWeak = Number(baselineRaw?.weak || 0) || 0;
  const baseKindRich = Number(baselineRaw?.kind_rich || 0) || 0;
  const baseKindMinOnly = Number(baselineRaw?.kind_min_only || 0) || 0;
  const hasStrictWeak = Object.prototype.hasOwnProperty.call(baselineRaw || {}, "strict_weak");
  const baseStrictWeak = hasStrictWeak ? Number(baselineRaw?.strict_weak || 0) || 0 : null;
  const delta = withNotes - baseWithNotes;

  console.log(`NOTES_BASELINE=${baseWithNotes}`);
  console.log(`NOTES_CURRENT=${withNotes}`);
  console.log(`NOTES_DELTA=${delta}`);
  console.log(`NOTES_BASELINE_WITH_NOTES=${baseWithNotes}`);
  console.log(`NOTES_BASELINE_OK=${baseOk}`);
  console.log(`NOTES_BASELINE_EMPTY=${baseEmpty}`);
  console.log(`NOTES_BASELINE_PLACEHOLDER=${basePlaceholder}`);
  console.log(`NOTES_BASELINE_WEAK=${baseWeak}`);
  console.log(`NOTES_PLACEHOLDER_MAX=${basePlaceholder}`);
  console.log(`NOTES_WEAK_MAX=${baseWeak}`);
  console.log(`NOTES_BASELINE_KIND_RICH=${baseKindRich}`);
  console.log(`NOTES_BASELINE_KIND_MIN_ONLY=${baseKindMinOnly}`);
  if (baseStrictWeak !== null) {
    console.log(`NOTES_BASELINE_STRICT_WEAK=${baseStrictWeak}`);
  }

  if (process.env.NOTES_BASELINE_BUMP === "1") {
    writeBaseline({
      total_geo: totalGeo,
      with_notes: withNotes,
      ok,
      empty,
      placeholder,
      weak,
      kind_rich: kindRich,
      kind_min_only: kindMinOnly,
      strict_weak: strictWeak
    });
    console.log("NOTES_BASELINE_BUMP=1");
    console.log("NOTES_QUALITY_GUARD=PASS");
    exitWith("BASELINE_BUMP", 0);
  }

  const regress =
    withNotes < baseWithNotes ||
    empty > baseEmpty ||
    placeholder > basePlaceholder ||
    weak > baseWeak ||
    kindRich < baseKindRich ||
    kindMinOnly < baseKindMinOnly ||
    (baseStrictWeak !== null && strictWeak > baseStrictWeak) ||
    minOnlyRegressions > 0;

  if (!regress) {
    console.log("NOTES_QUALITY_GUARD=PASS");
    exitWith("OK", 0);
  }

  const allow = process.env.NOTES_SHRINK_OK === "1";
  const reason = String(process.env.NOTES_SHRINK_REASON || "").trim();
  if (allow) {
    if (!reason) {
      console.log("NOTES_SHRINK_ERROR=reason_missing");
      exitWith("ERROR", 3);
    }
    console.log("NOTES_ALLOW_SHRINK=1");
    console.log(`NOTES_SHRINK_REASON=${reason}`);
    console.log("NOTES_QUALITY_GUARD=PASS");
    exitWith("OK", 0);
  }

  console.log("NOTES_QUALITY_GUARD=FAIL");
  exitWith("REGRESS_NOTES_SHRINK", 1);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.log(`NOTES_ERROR=${message}`);
  exitWith("ERROR", 2);
}
