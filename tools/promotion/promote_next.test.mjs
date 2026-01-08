import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "promo-"));
const dataDir = path.join(tmpDir, "data");
const lawsDir = path.join(dataDir, "laws", "world");
const sourcesDir = path.join(dataDir, "sources");
fs.mkdirSync(lawsDir, { recursive: true });
fs.mkdirSync(sourcesDir, { recursive: true });

const profile = {
  id: "TESTLAND",
  country: "Testland",
  review_status: "provisional",
  review_confidence: "low",
  medical: "unknown",
  recreational: "unknown",
  possession_limit: "unknown",
  public_use: "unknown",
  home_grow: "unknown",
  cross_border: "unknown",
  risks: ["border_crossing", "driving"],
  sources: [],
  updated_at: "2026-01-07",
  schema_version: 1
};
fs.writeFileSync(path.join(lawsDir, "TL.json"), JSON.stringify(profile, null, 2) + "\n");

const registry = [
  {
    country: "TL",
    sources: [
      {
        title: "Official Source",
        url: "https://example.com",
        kind: "official",
        checked_at: "2026-01-07",
        weight: 0.8
      }
    ]
  }
];
fs.writeFileSync(path.join(sourcesDir, "registry.json"), JSON.stringify(registry, null, 2) + "\n");

const result = spawnSync("node", [
  path.join(process.cwd(), "tools", "promotion", "promote_next.mjs"),
  "--count=1",
  "--seed=1337",
  `--root=${tmpDir}`
], { encoding: "utf8" });
assert.strictEqual(result.status, 0, result.stderr);

const updated = JSON.parse(fs.readFileSync(path.join(lawsDir, "TL.json"), "utf8"));
assert.strictEqual(updated.review_status, "needs_review");
assert.ok(updated.review_sources.length >= 1);
assert.strictEqual(updated.review_confidence, "medium");

fs.rmSync(tmpDir, { recursive: true, force: true });
