import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("report_law_verified counts snapshots and missing sources correctly", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "law-verified-"));
  const isoPath = path.join(tmpDir, "iso.json");
  const catalogPath = path.join(tmpDir, "official_catalog.json");
  const snapshotsDir = path.join(tmpDir, "snapshots");
  const lawsDir = path.join(tmpDir, "laws");
  const whitelistPath = path.join(tmpDir, "allowlist.json");

  fs.mkdirSync(path.join(lawsDir, "world"), { recursive: true });
  fs.mkdirSync(path.join(lawsDir, "eu"), { recursive: true });
  fs.mkdirSync(path.join(snapshotsDir, "AA", "20250101"), { recursive: true });

  fs.writeFileSync(
    isoPath,
    JSON.stringify({ entries: [{ alpha2: "AA" }, { alpha2: "BB" }, { alpha2: "CC" }] }, null, 2)
  );
  fs.writeFileSync(
    catalogPath,
    JSON.stringify(
      {
        AA: { medical: ["https://example.gov/aa"] },
        BB: { medical: ["https://example.gov/bb"] }
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    whitelistPath,
    JSON.stringify({ allowed: ["example.gov"] }, null, 2)
  );
  fs.writeFileSync(
    path.join(lawsDir, "world", "AA.json"),
    JSON.stringify({ id: "AA", review_status: "provisional" }, null, 2)
  );
  fs.writeFileSync(
    path.join(lawsDir, "world", "BB.json"),
    JSON.stringify({ id: "BB", review_status: "provisional" }, null, 2)
  );
  fs.writeFileSync(
    path.join(lawsDir, "world", "CC.json"),
    JSON.stringify({ id: "CC", review_status: "needs_review" }, null, 2)
  );
  fs.writeFileSync(
    path.join(snapshotsDir, "AA", "20250101", "meta.json"),
    JSON.stringify(
      {
        generated_at: "2025-01-01T00:00:00Z",
        items: [
          {
            iso2: "AA",
            url: "https://example.gov/aa",
            status: 200,
            snapshot: path.join(snapshotsDir, "AA", "20250101", "aa.html"),
            sha256: "deadbeef"
          }
        ]
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(snapshotsDir, "AA", "20250101", "aa.html"),
    "a".repeat(600)
  );

  const result = spawnSync(
    process.execPath,
    [path.join(process.cwd(), "tools", "law_verified", "report_law_verified.mjs"), "--stats"],
    {
      env: {
        ...process.env,
        LAW_VERIFIED_ISO_PATH: isoPath,
        LAW_VERIFIED_CATALOG_PATH: catalogPath,
        LAW_VERIFIED_SNAPSHOTS_DIR: snapshotsDir,
        LAW_VERIFIED_LAWS_DIR: lawsDir,
        LAW_VERIFIED_ALLOWLIST_PATH: whitelistPath
      },
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 0);
  const output = result.stdout.trim().split(/\s+/).map((value) => Number(value));
  assert.deepEqual(output, [0, 1, 1, 1, 0]);
  const total = 3;
  const sum = output.reduce((acc, value) => acc + value, 0);
  assert.equal(sum, total);
});
