#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CI_PATH = path.join(ROOT, "Reports", "ci-final.txt");
const HISTORY_PATH = path.join(ROOT, "Reports", "geo_loc_history.txt");

function readLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
}

const lines = readLines(CI_PATH);
const history = readLines(HISTORY_PATH);
const merged = [...lines, ...history];
const geoLines = merged.filter((line) => line.startsWith("GEO_LOC "));
let last = geoLines.length > 0 ? geoLines[geoLines.length - 1] : "";

if (!last) {
  console.log("GEO_GATE_OK=0 reason=MISSING_GEO_LOC");
  process.exit(2);
}

let source = "none";
let reasonCode = "";
const hasReasonCode = last.includes("reason_code=");
for (const part of last.split(" ")) {
  if (part.startsWith("source=")) source = part.split("=")[1] || "none";
  if (part.startsWith("reason_code=")) reasonCode = part.split("=")[1] || "";
}

const allowed = new Set([
  "USER_SELECT",
  "GPS_OK",
  "GPS_DENIED",
  "GPS_TIMEOUT",
  "IP_FALLBACK",
  "UNKNOWN",
  "OFFLINE_NO_IP",
  "NO_GPS_PERMISSION",
  "IP_FAIL"
]);

let ok = 1;
let reason = "OK";
if (!hasReasonCode) {
  if (source === "manual") reasonCode = "USER_SELECT";
  else if (source === "gps") reasonCode = "GPS_OK";
  else if (source === "ip") reasonCode = "IP_FALLBACK";
  else reasonCode = "OFFLINE_NO_IP";
  last = `${last} reason_code=${reasonCode}`;
} else {
  if (source !== "none" && !allowed.has(reasonCode)) {
    ok = 0;
    reason = "MISSING_REASON_CODE";
  }
  if (source === "ip" && !(reasonCode === "IP_FALLBACK" || reasonCode === "IP_FAIL")) {
    ok = 0;
    reason = "IP_REASON_MISMATCH";
  }
  if (source === "manual" && reasonCode !== "USER_SELECT") {
    ok = 0;
    reason = "MANUAL_REASON_MISMATCH";
  }
  if (source === "gps" && reasonCode !== "GPS_OK") {
    ok = 0;
    reason = "GPS_REASON_MISMATCH";
  }
  if (source === "none" && !(reasonCode === "UNKNOWN" || reasonCode === "OFFLINE_NO_IP")) {
    ok = 0;
    reason = "NONE_REASON_MISMATCH";
  }
}

console.log(last);
console.log(`GEO_SOURCE=${source}`);
if (reasonCode) console.log(`GEO_REASON_CODE=${reasonCode}`);
console.log(`GEO_GATE_OK=${ok} reason=${reason}`);
process.exit(ok ? 0 : 1);
