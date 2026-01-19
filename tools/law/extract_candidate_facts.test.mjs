import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

function runExtract(args) {
  return spawnSync(process.execPath, [path.join(process.cwd(), "tools", "law", "extract_candidate_facts.mjs"), ...args], {
    encoding: "utf8"
  });
}

test("extract_candidate_facts writes low confidence with evidence (html)", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "candidate-facts-"));
  const snapshotPath = path.join(tmpDir, "sample.html");
  const outPath = path.join(tmpDir, "DK.json");
  fs.writeFileSync(snapshotPath, "<html><body>Sample</body></html>");

  const result = runExtract([
    "--iso2",
    "DK",
    "--url",
    "https://example.gov/dk",
    "--snapshot",
    snapshotPath,
    "--sha256",
    "deadbeef",
    "--retrieved-at",
    "2025-01-01T00:00:00Z",
    "--out",
    outPath
  ]);

  assert.equal(result.status, 0);
  const payload = JSON.parse(fs.readFileSync(outPath, "utf8"));
  assert.equal(payload.iso2, "DK");
  assert.equal(payload.confidence, "low");
  assert.equal(Array.isArray(payload.evidence), true);
  assert.equal(payload.evidence.length, 1);
  assert.equal(payload.evidence[0].snapshot_path, snapshotPath);
});

test("extract_candidate_facts writes low confidence with evidence (pdf)", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "candidate-facts-"));
  const snapshotPath = path.join(tmpDir, "sample.pdf");
  const outPath = path.join(tmpDir, "CZ.json");
  fs.writeFileSync(snapshotPath, "%PDF-1.4\\n%EOF");

  const result = runExtract([
    "--iso2",
    "CZ",
    "--url",
    "https://example.gov/cz",
    "--snapshot",
    snapshotPath,
    "--sha256",
    "beadfeed",
    "--out",
    outPath
  ]);

  assert.equal(result.status, 0);
  const payload = JSON.parse(fs.readFileSync(outPath, "utf8"));
  assert.equal(payload.iso2, "CZ");
  assert.equal(payload.confidence, "low");
  assert.equal(payload.evidence[0].sha256, "beadfeed");
});
