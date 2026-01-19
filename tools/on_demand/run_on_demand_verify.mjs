import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const VERIFY_SCRIPT = path.join(ROOT, "tools", "wiki", "verify_from_wiki.mjs");
const REPORT_DIR = path.join(ROOT, "Reports", "on_demand");
const LAST_RUN_PATH = path.join(REPORT_DIR, "last_run.json");

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    iso: "",
    iso2: ""
  };
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i + 1];
    if (args[i] === "--iso" && value) options.iso = value.toUpperCase();
    if (args[i] === "--iso2" && value) options.iso2 = value.toUpperCase();
  }
  return options;
}

async function main() {
  const options = parseArgs();
  const iso2 = String(options.iso2 || options.iso || "").toUpperCase();
  const reportIso = String(options.iso || iso2 || "").toUpperCase();
  const perIsoPath = reportIso
    ? path.join(REPORT_DIR, reportIso, "last_run.json")
    : LAST_RUN_PATH;
  const startedAt = new Date().toISOString();

  if (!iso2 || iso2.length < 2) {
    const payload = {
      iso: reportIso || iso2 || "",
      iso2,
      started_at: startedAt,
      result: "none",
      reason: "INVALID_ISO"
    };
    writeJson(perIsoPath, payload);
    writeJson(LAST_RUN_PATH, payload);
    console.log(
      `ON_DEMAND: iso=${reportIso || iso2 || "-"} snap=N evidence=N kind=non_law mv_delta=0 cand_delta=+0 reason=INVALID_ISO`
    );
    process.exit(1);
  }

  if (process.env.NETWORK !== "1") {
    const payload = {
      iso: reportIso,
      iso2,
      started_at: startedAt,
      result: "PENDING",
      reason: "OFFLINE",
      wrote_mv: false
    };
    writeJson(perIsoPath, payload);
    writeJson(LAST_RUN_PATH, payload);
    console.log(
      `ON_DEMAND: iso=${reportIso || iso2} snap=N evidence=N kind=non_law mv_delta=0 cand_delta=+0 reason=OFFLINE`
    );
    process.exit(2);
  }

  const result = spawnSync(process.execPath, [VERIFY_SCRIPT, "--geo", reportIso], {
    encoding: "utf8",
    timeout: 20000
  });
  const reportPath = path.join(REPORT_DIR, reportIso, "last_run.json");
  const report = readJson(reportPath, {});
  const mvWritten = Number(report?.mv_written || 0) > 0;
  const evidenceKind = mvWritten ? "law" : "non_law";
  const payload = {
    iso: reportIso,
    iso2,
    started_at: startedAt,
    result: mvWritten ? "VERIFIED" : "PENDING",
    reason: report?.reason || "UNKNOWN",
    wrote_mv: mvWritten,
    snapshots: Number(report?.snapshots || 0) || 0,
    evidence_ok: mvWritten,
    evidence_kind: evidenceKind
  };
  writeJson(perIsoPath, payload);
  writeJson(LAST_RUN_PATH, payload);
  console.log(
    `ON_DEMAND: iso=${reportIso || iso2} snap=${payload.snapshots ? "Y" : "N"} evidence=${mvWritten ? "Y" : "N"} kind=${evidenceKind} mv_delta=${mvWritten ? "+1" : "0"} cand_delta=+0 reason=${payload.reason}`
  );
  process.exit(result.status ?? (mvWritten ? 0 : 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
