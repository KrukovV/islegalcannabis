import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

test("extract_cannabis_facts creates evidence from html and pdf meta", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilc-facts-"));
  const snapshotsDir = path.join(tmpDir, "snapshots");
  const outputPath = path.join(tmpDir, "legal_ssot.json");
  const fixturesDir = path.join(process.cwd(), "tools", "ssot", "fixtures");

  const htmlDir = path.join(snapshotsDir, "AA", "20250101");
  fs.mkdirSync(htmlDir, { recursive: true });
  const htmlPath = path.join(htmlDir, "a1.html");
  fs.copyFileSync(path.join(fixturesDir, "sample.html"), htmlPath);
  fs.writeFileSync(
    path.join(htmlDir, "meta.json"),
    JSON.stringify(
      {
        items: [
          {
            iso2: "AA",
            url: "https://example.gov/a",
            snapshot: htmlPath
          }
        ]
      },
      null,
      2
    )
  );

  const pdfDir = path.join(snapshotsDir, "BB", "20250102");
  fs.mkdirSync(pdfDir, { recursive: true });
  const pdfPath = path.join(pdfDir, "b1.pdf");
  fs.copyFileSync(path.join(fixturesDir, "sample.pdf"), pdfPath);
  fs.writeFileSync(
    path.join(pdfDir, "meta.json"),
    JSON.stringify(
      {
        items: [
          {
            iso2: "BB",
            url: "https://example.gov/b",
            snapshot: pdfPath,
            text_excerpt: "Medical: allowed",
            locator: "page=2"
          }
        ]
      },
      null,
      2
    )
  );

  const result = spawnSync(
    process.execPath,
    [
      path.join(process.cwd(), "tools", "ssot", "extract_cannabis_facts.mjs"),
      "--snapshots",
      snapshotsDir,
      "--output",
      outputPath
    ],
    { stdio: "inherit" }
  );
  assert.equal(result.status, 0);

  const payload = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  const entries = payload.entries || {};
  assert.equal(entries.AA.recreational_status, "allowed");
  assert.equal(entries.AA.medical_status, "restricted");
  assert.equal(entries.AA.confidence, "high");
  assert.ok(entries.AA.evidence.length >= 1);
  assert.equal(entries.BB.medical_status, "allowed");
  assert.equal(entries.BB.confidence, "high");
});
