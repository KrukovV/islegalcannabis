import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const VERIFY_SCRIPT = path.join(ROOT, "tools", "wiki", "verify_from_wiki.mjs");

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    iso: "",
    region: ""
  };
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i + 1];
    if (args[i] === "--iso" && value) options.iso = value.toUpperCase();
    if (args[i].startsWith("--iso=")) options.iso = args[i].slice(6).toUpperCase();
    if (args[i] === "--region" && value) options.region = value.toUpperCase();
    if (args[i].startsWith("--region=")) options.region = args[i].slice(9).toUpperCase();
  }
  return options;
}

function buildRunId() {
  if (process.env.ON_DEMAND_RUN_ID) return process.env.ON_DEMAND_RUN_ID;
  return `${Date.now()}`;
}

function testModeOutput(runId, iso2, payload) {
  const runDir = path.join(ROOT, "Reports", "on_demand", runId);
  const runPath = path.join(runDir, "run.json");
  writeJson(runPath, {
    iso: iso2,
    iso2,
    stage: payload.stage,
    reason: payload.reason
  });
  process.exit(payload.exitCode || 0);
}

function main() {
  const options = parseArgs();
  const runId = buildRunId();
  const isoInput = String(options.iso || "").toUpperCase();
  const regionInput = String(options.region || "").toUpperCase();
  if (process.env.ON_DEMAND_TEST === "1") {
    const payload = JSON.parse(process.env.ON_DEMAND_TEST_DATA || "{}") || {};
    return testModeOutput(runId, isoInput || "-", payload);
  }
  if (!isoInput || !/^[A-Z]{2}$/.test(isoInput)) {
    const runPath = path.join(ROOT, "Reports", "on_demand", runId, "run.json");
    writeJson(runPath, {
      iso: isoInput,
      iso2: isoInput,
      reason: "INVALID_ISO"
    });
    process.exit(1);
  }
  if (process.env.NETWORK !== "1") {
    const runPath = path.join(ROOT, "Reports", "on_demand", runId, "run.json");
    writeJson(runPath, {
      iso: isoInput,
      iso2: isoInput,
      reason: "OFFLINE"
    });
    process.exit(2);
  }
  const geoKey = regionInput ? `${isoInput}-${regionInput}` : isoInput;
  const result = spawnSync(process.execPath, [VERIFY_SCRIPT, "--geo", geoKey], {
    encoding: "utf8",
    timeout: 20000
  });
  const reportPath = path.join(ROOT, "Reports", "on_demand", geoKey, "last_run.json");
  const report = fs.existsSync(reportPath)
    ? JSON.parse(fs.readFileSync(reportPath, "utf8"))
    : { reason: "NO_REPORT" };
  const runPayload = {
    iso: geoKey,
    iso2: isoInput,
    status: report.mv_written ? "OK" : "PENDING",
    reason: report.reason || "UNKNOWN",
    report_path: reportPath
  };
  const runPath = path.join(ROOT, "Reports", "on_demand", runId, "run.json");
  writeJson(runPath, runPayload);
  process.exit(result.status ?? 2);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
