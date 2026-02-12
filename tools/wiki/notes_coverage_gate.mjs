#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const baselinePath = path.join(ROOT, "Reports", "notes_coverage.baseline.txt");
const coveragePath = path.join(ROOT, "Reports", "notes-coverage.txt");

function readBaseline(filePath) {
  if (!fs.existsSync(filePath)) return { ok: false, error: `missing_baseline_file:${filePath}` };
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let covered = null;
  let ok = null;
  let placeholder = null;
  let weak = null;
  for (const line of lines) {
    if (/^\d+$/.test(line)) {
      covered = Number(line);
      continue;
    }
    const [key, value] = line.split("=").map((part) => part.trim());
    if (!key || !value) continue;
    if (key === "NOTES_BASELINE_COVERED") covered = Number(value);
    if (key === "NOTES_BASELINE_OK") ok = Number(value);
    if (key === "NOTES_BASELINE_PLACEHOLDER") placeholder = Number(value);
    if (key === "NOTES_BASELINE_WEAK") weak = Number(value);
  }
  if (!Number.isFinite(ok) || !Number.isFinite(placeholder) || !Number.isFinite(weak)) {
    return { ok: false, error: "bad_baseline_values" };
  }
  return {
    ok: true,
    covered: Number.isFinite(covered) ? covered : null,
    okCount: ok,
    placeholder,
    weak
  };
}

function readCoverage(filePath) {
  if (!fs.existsSync(filePath)) return { ok: false, error: `missing_coverage_file:${filePath}` };
  const line = fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith("NOTES_COVERAGE total_geo="));
  if (!line) return { ok: false, error: "missing_notes_coverage_line" };
  const capture = (label) => {
    const match = line.match(new RegExp(`${label}=([0-9]+)`));
    return match ? Number(match[1]) : null;
  };
  const okCount = capture("ok");
  const placeholder = capture("placeholder");
  const weak = capture("weak");
  if (!Number.isFinite(okCount) || !Number.isFinite(placeholder) || !Number.isFinite(weak)) {
    return { ok: false, error: "bad_current_values" };
  }
  return { ok: true, okCount, placeholder, weak };
}

function fail(reason, extra = []) {
  if (extra.length) {
    for (const line of extra) console.log(line);
  }
  console.log("NOTES_QUALITY_GUARD=FAIL");
  console.log(`NOTES_QUALITY_FAIL_REASON=${reason}`);
  process.exit(1);
}

const baseline = readBaseline(baselinePath);
if (!baseline.ok) {
  console.log(`NOTES_BASELINE_PATH=${baselinePath}`);
  fail(baseline.error);
}

const current = readCoverage(coveragePath);
if (!current.ok) {
  console.log(`NOTES_BASELINE_PATH=${baselinePath}`);
  fail(current.error);
}

const allowDrop = process.env.ALLOW_NOTES_QUALITY_DROP === "1";
const dropReason = String(process.env.NOTES_QUALITY_DROP_REASON || "");

console.log(`NOTES_BASELINE_OK=${baseline.okCount}`);
console.log(`NOTES_BASELINE_PLACEHOLDER=${baseline.placeholder}`);
console.log(`NOTES_BASELINE_WEAK=${baseline.weak}`);
console.log(`NOTES_OK=${current.okCount}`);
console.log(`NOTES_PLACEHOLDER=${current.placeholder}`);

const okDropped = current.okCount < baseline.okCount;
const placeholderIncreased = current.placeholder > baseline.placeholder;
const weakIncreased = current.weak > baseline.weak;
if (okDropped || placeholderIncreased || weakIncreased) {
  if (!allowDrop) {
    fail("NOTES_QUALITY_DROP");
  }
  if (!dropReason) {
    fail("NOTES_QUALITY_DROP_REASON_MISSING");
  }
  console.log("NOTES_QUALITY_ALLOW_DROP=1");
  console.log(`NOTES_QUALITY_DROP_REASON=${dropReason}`);
  console.log("NOTES_QUALITY_GUARD=PASS");
  process.exit(0);
}

console.log("NOTES_QUALITY_GUARD=PASS");
