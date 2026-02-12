#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SSOT_PATH = path.join(ROOT, "data", "wiki", "ssot_legality_table.json");
const BASELINE_PATH = path.join(ROOT, "Reports", "legality_table.baseline.txt");

function readBaseline(pathValue) {
  const raw = fs.readFileSync(pathValue, "utf8").trim();
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function writeBaseline(count) {
  fs.writeFileSync(BASELINE_PATH, `${count}\n`, "utf8");
}

function exitWith(reason, code) {
  console.log(`LEGALITY_TABLE_GUARD=${reason}`);
  process.exit(code);
}

try {
  if (!fs.existsSync(SSOT_PATH)) {
    console.log(`LEGALITY_TABLE_ERROR=missing_ssot path=${SSOT_PATH}`);
    exitWith("FAIL", 2);
  }
  const ssot = JSON.parse(fs.readFileSync(SSOT_PATH, "utf8"));
  const rows = Array.isArray(ssot?.rows) ? ssot.rows.length : 0;
  console.log(`LEGALITY_TABLE_ROWS=${rows}`);
  console.log(`LEGALITY_TABLE_BASELINE_PATH=${BASELINE_PATH}`);

  if (!fs.existsSync(BASELINE_PATH)) {
    if (process.env.LEGALITY_BASELINE_INIT === "1") {
      writeBaseline(rows);
      console.log("LEGALITY_TABLE_BASELINE_INIT=1");
      console.log(`LEGALITY_TABLE_BASELINE=${rows}`);
      console.log("LEGALITY_TABLE_DELTA=0");
      exitWith("PASS", 0);
    }
    if (process.env.LEGALITY_GUARD_SKIP_OK === "1") {
      const reason = String(process.env.LEGALITY_GUARD_SKIP_REASON || "").trim();
      if (!reason) {
        console.log("LEGALITY_TABLE_ERROR=skip_allowed_but_reason_missing");
        exitWith("FAIL", 3);
      }
      console.log("LEGALITY_TABLE_SKIP_OK=1");
      console.log(`LEGALITY_TABLE_SKIP_REASON=${reason}`);
      exitWith("SKIP", 0);
    }
    console.log("LEGALITY_TABLE_BASELINE=missing");
    console.log("LEGALITY_TABLE_ERROR=baseline_missing");
    exitWith("FAIL", 2);
  }

  const baseline = readBaseline(BASELINE_PATH);
  console.log(`LEGALITY_TABLE_BASELINE=${baseline}`);

  if (process.env.LEGALITY_BASELINE_BUMP === "1") {
    writeBaseline(rows);
    console.log("LEGALITY_TABLE_BASELINE_BUMP=1");
    exitWith("PASS", 0);
  }

  console.log(`LEGALITY_TABLE_DELTA=${rows - baseline}`);
  if (rows >= baseline) {
    exitWith("PASS", 0);
  }

  const allow = process.env.LEGALITY_SHRINK_OK === "1";
  const reason = String(process.env.LEGALITY_SHRINK_REASON || "").trim();
  if (allow) {
    if (!reason) {
      console.log("LEGALITY_TABLE_ERROR=shrink_allowed_but_reason_missing");
      exitWith("FAIL", 3);
    }
    console.log("LEGALITY_TABLE_ALLOW_SHRINK=1");
    console.log(`LEGALITY_TABLE_SHRINK_REASON=${reason}`);
    exitWith("PASS", 0);
  }

  console.log("LEGALITY_TABLE_ERROR=shrink_detected");
  exitWith("FAIL", 1);
} catch (error) {
  console.log(`LEGALITY_TABLE_ERROR=${error instanceof Error ? error.message : String(error)}`);
  exitWith("FAIL", 2);
}
