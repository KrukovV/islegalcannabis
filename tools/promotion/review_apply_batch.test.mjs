import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "review-batch-"));
const dataDir = path.join(tmpDir, "data");
const lawsDir = path.join(dataDir, "laws", "world");
const reviewsDir = path.join(dataDir, "reviews");
const sourcesDir = path.join(dataDir, "sources");
const ssotDir = path.join(dataDir, "ssot");

fs.mkdirSync(lawsDir, { recursive: true });
fs.mkdirSync(reviewsDir, { recursive: true });
fs.mkdirSync(sourcesDir, { recursive: true });
fs.mkdirSync(ssotDir, { recursive: true });

writeJson(path.join(ssotDir, "facts_schema.json"), {
  schema_version: 1,
  required_fields: ["medical", "recreational", "public_use", "cross_border"],
  date_fields: ["effective_date"]
});

writeJson(path.join(sourcesDir, "official_registry.json"), {
  AA: ["example.com"],
  CC: ["example.com"]
});
writeJson(path.join(sourcesDir, "neutral_registry.json"), {});

const baseProfile = {
  country: "AA",
  medical: "unknown",
  recreational: "unknown",
  possession_limit: "unknown",
  public_use: "unknown",
  home_grow: "unknown",
  cross_border: "unknown",
  risks: ["border_crossing", "driving"],
  review_status: "needs_review",
  review_confidence: "low",
  updated_at: "2026-01-01",
  schema_version: 1,
  verified_official: true,
  facts: [
    {
      category: "medical",
      url: "https://example.com",
      effective_date: "2024-01-01",
      text_snippet: null
    }
  ]
};

writeJson(path.join(lawsDir, "AA.json"), {
  ...baseProfile,
  id: "AA",
  country: "AA"
});
writeJson(path.join(lawsDir, "BB.json"), {
  ...baseProfile,
  id: "BB",
  country: "BB"
});
writeJson(path.join(lawsDir, "CC.json"), {
  ...baseProfile,
  id: "CC",
  country: "CC"
});

writeJson(path.join(reviewsDir, "AA.review.json"), {
  id: "AA",
  updates: {
    medical: "allowed",
    recreational: "restricted",
    public_use: "illegal",
    cross_border: "illegal",
    effective_date: "2024-01-01"
  },
  review_sources: [
    {
      title: "Official",
      url: "https://example.com",
      kind: "official"
    }
  ]
});

writeJson(path.join(reviewsDir, "BB.review.json"), {
  id: "BB",
  updates: {
    medical: "allowed",
    recreational: "restricted",
    public_use: "illegal",
    cross_border: "illegal",
    effective_date: "2024-01-01"
  },
  review_sources: []
});

writeJson(path.join(reviewsDir, "CC.review.json"), {
  id: "CC",
  updates: {
    medical: "unknown",
    recreational: "restricted",
    public_use: "illegal",
    cross_border: "illegal",
    effective_date: "2024-01-01"
  },
  review_sources: [
    {
      title: "Official",
      url: "https://example.com",
      kind: "official"
    }
  ]
});

const result = spawnSync("node", [
  path.join(process.cwd(), "tools", "promotion", "review_apply_batch.mjs"),
  "--limit=5",
  `--dir=${reviewsDir}`,
  `--root=${tmpDir}`
], { encoding: "utf8" });

assert.strictEqual(result.status, 0, result.stderr);

const reportPath = path.join(tmpDir, "Reports", "promotion", "last_batch.json");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));

assert.deepStrictEqual(report.applied, ["AA"]);
const reasons = report.rejected.map((entry) => entry.reason).sort();
assert.deepStrictEqual(reasons, ["no_sources", "schema_fail"]);

fs.rmSync(tmpDir, { recursive: true, force: true });
