import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

test("AUTO_LEARN offline uses existing snapshots", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilc-auto-offline-"));
  const catalogPath = path.join(tmpDir, "official_catalog.json");
  const registryPath = path.join(tmpDir, "sources_registry.json");
  const snapshotsDir = path.join(tmpDir, "snapshots");
  const ssotPath = path.join(tmpDir, "legal_ssot.json");
  const lawsDir = path.join(tmpDir, "laws");
  fs.mkdirSync(path.join(lawsDir, "world"), { recursive: true });

  fs.writeFileSync(
    catalogPath,
    JSON.stringify(
      {
        AA: {
          verified: {
            medical: ["https://www.gov.uk/"],
            recreational: []
          },
          candidates: [],
          notes: ""
        }
      },
      null,
      2
    )
  );

  const build = spawnSync(
    process.execPath,
    [
      path.join(process.cwd(), "tools", "sources", "build_sources_registry_from_official.mjs"),
      "--catalog",
      catalogPath,
      "--output",
      registryPath
    ],
    { stdio: "inherit" }
  );
  assert.equal(build.status, 0);

  const dayDir = path.join(snapshotsDir, "AA", "20250103");
  fs.mkdirSync(dayDir, { recursive: true });
  const htmlPath = path.join(dayDir, "snap.html");
  fs.writeFileSync(
    htmlPath,
    "<html><body>Medical: allowed. Recreational: restricted.</body></html>"
  );
  fs.writeFileSync(
    path.join(dayDir, "meta.json"),
    JSON.stringify(
      {
        items: [
          {
            iso2: "AA",
            url: "https://www.gov.uk/",
            snapshot: htmlPath
          }
        ]
      },
      null,
      2
    )
  );

  const fetch = spawnSync(
    process.execPath,
    [
      path.join(process.cwd(), "tools", "sources", "fetch_snapshots.mjs"),
      "--registry",
      registryPath,
      "--out",
      snapshotsDir
    ],
    { env: { ...process.env, NETWORK: "0" }, stdio: "inherit" }
  );
  assert.equal(fetch.status, 0);

  const extract = spawnSync(
    process.execPath,
    [
      path.join(process.cwd(), "tools", "ssot", "extract_cannabis_facts.mjs"),
      "--snapshots",
      snapshotsDir,
      "--output",
      ssotPath
    ],
    { stdio: "inherit" }
  );
  assert.equal(extract.status, 0);

  fs.writeFileSync(
    path.join(lawsDir, "world", "AA.json"),
    JSON.stringify(
      {
        id: "AA",
        country: "AA",
        medical: "unknown",
        recreational: "unknown",
        public_use: "unknown",
        cross_border: "unknown",
        risks: [],
        sources: [],
        updated_at: "2025-01-01",
        verified_at: null,
        confidence: "low",
        status: "provisional",
        review_status: "provisional",
        schema_version: 2
      },
      null,
      2
    )
  );

  const apply = spawnSync(
    process.execPath,
    [
      path.join(process.cwd(), "tools", "promotion", "auto_apply_verified.mjs"),
      "--ssot",
      ssotPath,
      "--laws",
      lawsDir,
      "--report",
      path.join(tmpDir, "report.json")
    ],
    { stdio: "inherit" }
  );
  assert.equal(apply.status, 0);
});
