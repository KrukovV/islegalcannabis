import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

test("auto_apply_verified promotes only high confidence with evidence", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilc-auto-"));
  const ssotPath = path.join(tmpDir, "legal_ssot.json");
  const lawsDir = path.join(tmpDir, "laws");
  fs.mkdirSync(path.join(lawsDir, "world"), { recursive: true });

  fs.writeFileSync(
    ssotPath,
    JSON.stringify(
      {
        entries: {
          AA: {
            recreational_status: "allowed",
            medical_status: "allowed",
            confidence: "high",
            evidence: [{ snapshotRef: "snap", locator: "page=1", quote: "ok" }]
          },
          BB: {
            recreational_status: "allowed",
            medical_status: "allowed",
            confidence: "medium",
            evidence: []
          }
        }
      },
      null,
      2
    )
  );

  const baseProfile = {
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
  };
  fs.writeFileSync(
    path.join(lawsDir, "world", "AA.json"),
    JSON.stringify(baseProfile, null, 2)
  );
  fs.writeFileSync(
    path.join(lawsDir, "world", "BB.json"),
    JSON.stringify({ ...baseProfile, id: "BB", country: "BB" }, null, 2)
  );

  const result = spawnSync(
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
  assert.equal(result.status, 0);

  const aa = JSON.parse(
    fs.readFileSync(path.join(lawsDir, "world", "AA.json"), "utf8")
  );
  const bb = JSON.parse(
    fs.readFileSync(path.join(lawsDir, "world", "BB.json"), "utf8")
  );
  assert.equal(aa.status, "known");
  assert.equal(aa.review_status, "known");
  assert.equal(bb.status, "provisional");
});
