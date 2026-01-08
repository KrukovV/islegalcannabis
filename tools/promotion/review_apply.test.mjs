import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "review-"));
const dataDir = path.join(tmpDir, "data");
const lawsDir = path.join(dataDir, "laws", "world");
const reviewsDir = path.join(dataDir, "reviews");
fs.mkdirSync(lawsDir, { recursive: true });
fs.mkdirSync(reviewsDir, { recursive: true });

const profile = {
  id: "TESTLAND",
  country: "Testland",
  review_status: "needs_review",
  review_confidence: "medium",
  medical: "unknown",
  recreational: "unknown",
  possession_limit: "unknown",
  public_use: "unknown",
  home_grow: "unknown",
  cross_border: "unknown",
  risks: ["border_crossing", "driving"],
  review_sources: [
    {
      title: "Official Source",
      url: "https://example.com",
      kind: "official",
      checked_at: "2026-01-07",
      weight: 0.8
    }
  ],
  updated_at: "2026-01-07",
  schema_version: 1
};
fs.writeFileSync(path.join(lawsDir, "TL.json"), JSON.stringify(profile, null, 2) + "\n");

const review = {
  id: "TL",
  updates: { medical: "unknown" },
  review_sources: [
    {
      title: "Official Source",
      url: "https://example.com",
      kind: "official",
      checked_at: "2026-01-07",
      weight: 0.8
    }
  ]
};
const reviewPath = path.join(reviewsDir, "TL.review.json");
fs.writeFileSync(reviewPath, JSON.stringify(review, null, 2) + "\n");

const result = spawnSync("node", [
  path.join(process.cwd(), "tools", "promotion", "review_apply.mjs"),
  `--file=${reviewPath}`,
  `--root=${tmpDir}`
], { encoding: "utf8" });
assert.strictEqual(result.status, 0, result.stderr);

const updated = JSON.parse(fs.readFileSync(path.join(lawsDir, "TL.json"), "utf8"));
assert.strictEqual(updated.review_status, "reviewed");
assert.ok(["high", "medium"].includes(updated.review_confidence));

fs.rmSync(tmpDir, { recursive: true, force: true });
