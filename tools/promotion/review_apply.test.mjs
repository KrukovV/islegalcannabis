import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "review-"));
  const dataDir = path.join(tmpDir, "data");
  const lawsDir = path.join(dataDir, "laws", "world");
  const reviewsDir = path.join(dataDir, "reviews");
  const sourcesDir = path.join(dataDir, "sources");
  const ssotDir = path.join(dataDir, "ssot");
  fs.mkdirSync(lawsDir, { recursive: true });
  fs.mkdirSync(reviewsDir, { recursive: true });
  fs.mkdirSync(sourcesDir, { recursive: true });
  fs.mkdirSync(ssotDir, { recursive: true });

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
    updates: {
      medical: "allowed",
      recreational: "restricted",
      public_use: "illegal",
      cross_border: "illegal",
      effective_date: "2026-01-01"
    },
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
  fs.writeFileSync(
    path.join(sourcesDir, "official_registry.json"),
    JSON.stringify({ TL: ["example.com"] }, null, 2) + "\n"
  );
  fs.writeFileSync(
    path.join(sourcesDir, "neutral_registry.json"),
    JSON.stringify({}, null, 2) + "\n"
  );
  fs.writeFileSync(
    path.join(ssotDir, "facts_schema.json"),
    JSON.stringify(
      {
        schema_version: 1,
        required_fields: ["medical", "recreational", "public_use", "cross_border"],
        date_fields: ["effective_date"]
      },
      null,
      2
    ) + "\n"
  );

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
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "review-"));
  const dataDir = path.join(tmpDir, "data");
  const lawsDir = path.join(dataDir, "laws", "world");
  const reviewsDir = path.join(dataDir, "reviews");
  const sourcesDir = path.join(dataDir, "sources");
  const ssotDir = path.join(dataDir, "ssot");
  fs.mkdirSync(lawsDir, { recursive: true });
  fs.mkdirSync(reviewsDir, { recursive: true });
  fs.mkdirSync(sourcesDir, { recursive: true });
  fs.mkdirSync(ssotDir, { recursive: true });

  const profile = {
    id: "BADLAND",
    country: "Badland",
    review_status: "needs_review",
    review_confidence: "medium",
    medical: "unknown",
    recreational: "unknown",
    possession_limit: "unknown",
    public_use: "unknown",
    home_grow: "unknown",
    cross_border: "unknown",
    risks: ["border_crossing", "driving"],
    updated_at: "2026-01-07",
    schema_version: 1
  };
  fs.writeFileSync(path.join(lawsDir, "BL.json"), JSON.stringify(profile, null, 2) + "\n");

  const review = {
    id: "BL",
    updates: {
      status: "known",
      medical: "allowed",
      recreational: "restricted",
      public_use: "illegal",
      cross_border: "illegal"
    },
    review_sources: [
      {
        title: "Official Source",
        url: "ftp://example.com",
        kind: "official",
        checked_at: "2026-01-07",
        weight: 0.8
      }
    ]
  };
  const reviewPath = path.join(reviewsDir, "BL.review.json");
  fs.writeFileSync(reviewPath, JSON.stringify(review, null, 2) + "\n");
  fs.writeFileSync(
    path.join(sourcesDir, "official_registry.json"),
    JSON.stringify({ BL: ["example.com"] }, null, 2) + "\n"
  );
  fs.writeFileSync(
    path.join(sourcesDir, "neutral_registry.json"),
    JSON.stringify({}, null, 2) + "\n"
  );
  fs.writeFileSync(
    path.join(ssotDir, "facts_schema.json"),
    JSON.stringify(
      {
        schema_version: 1,
        required_fields: ["medical", "recreational", "public_use", "cross_border"],
        date_fields: ["effective_date"]
      },
      null,
      2
    ) + "\n"
  );

  const result = spawnSync("node", [
    path.join(process.cwd(), "tools", "promotion", "review_apply.mjs"),
    `--file=${reviewPath}`,
    `--root=${tmpDir}`
  ], { encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr);

  const updated = JSON.parse(fs.readFileSync(path.join(lawsDir, "BL.json"), "utf8"));
  assert.strictEqual(updated.status, "needs_review");
  assert.strictEqual(updated.review_status, "needs_review");
  assert.ok(Array.isArray(updated.review_notes));

  fs.rmSync(tmpDir, { recursive: true, force: true });
}
