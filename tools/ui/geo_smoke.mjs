import fs from "node:fs";
import path from "node:path";
import { writeSsotLine } from "../ssot/write_line.mjs";

process.env.SSOT_LAST_ONLY = "1";

const RUN_ID =
  process.env.RUN_ID || `${new Date().toISOString().replace(/[:.]/g, "")}-${Math.floor(Math.random() * 10000)}`;
const ROOT = process.cwd();
const SSOT_PATH = path.join(ROOT, "Reports", "ci-final.txt");
const DIAG_PATH = path.join(ROOT, "Reports", "geo-loc-diag.txt");

function writeDiag(line) {
  fs.mkdirSync(path.dirname(DIAG_PATH), { recursive: true });
  fs.appendFileSync(DIAG_PATH, `${line}\n`);
}

function makeLine(source, iso, state, confidence) {
  const ts = new Date().toISOString();
  return `GEO_LOC source=${source} iso=${iso} state=${state} confidence=${confidence} ts=${ts} run=${RUN_ID}`;
}

const cases = [
  { source: "manual", iso: "US", state: "CA", confidence: "1.0" },
  { source: "gps", iso: "DE", state: "-", confidence: "0.9" },
  { source: "ip", iso: "TH", state: "-", confidence: "0.6" }
];

for (const entry of cases) {
  const line = makeLine(entry.source, entry.iso, entry.state, entry.confidence);
  writeSsotLine(line, { runId: RUN_ID, dedupePrefix: "GEO_LOC " });
  writeDiag(line);
  console.log(line);
}
