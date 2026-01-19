import fs from "node:fs";
import path from "node:path";

function readArg(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx !== -1) return process.argv[idx + 1] ?? fallback;
  return fallback;
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function main() {
  const iso2 = String(readArg("--iso2", "") || "").toUpperCase();
  const url = String(readArg("--url", "") || "").trim();
  const snapshotPath = String(readArg("--snapshot", "") || "").trim();
  const sha256 = String(readArg("--sha256", "") || "").trim();
  const retrievedAt = String(readArg("--retrieved-at", "") || "").trim();
  const outPath = String(readArg("--out", "") || "").trim();

  if (!iso2 || !url || !snapshotPath || !sha256 || !outPath) {
    fail("missing required args");
  }
  if (!fs.existsSync(snapshotPath)) {
    fail("snapshot_missing");
  }

  const evidence = [
    {
      type: "snapshot",
      url,
      snapshot_path: snapshotPath,
      sha256,
      retrieved_at: retrievedAt || new Date().toISOString(),
      anchor_hint: ""
    }
  ];

  const payload = {
    iso2,
    status_recreational: "unknown",
    status_medical: "unknown",
    why_bullets: [],
    evidence,
    confidence: "low",
    method: "auto_learn_candidate",
    generated_at: new Date().toISOString()
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
}

main();
