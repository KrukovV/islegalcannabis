import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

test("extract_skeleton_facts builds legal_ssot entries", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilc-ssot-"));
  const snapshotsDir = path.join(tmpDir, "snapshots");
  const outputPath = path.join(tmpDir, "legal_ssot.json");
  const dayDir = path.join(snapshotsDir, "DE", "2026-01-10");

  fs.mkdirSync(dayDir, { recursive: true });
  fs.writeFileSync(path.join(dayDir, "abc.html"), "<html>ok</html>");
  fs.writeFileSync(
    path.join(dayDir, "meta.json"),
    JSON.stringify(
      {
        items: [
          {
            iso2: "DE",
            kind: "medical",
            type: "verified",
            url: "https://example.gov/medical",
            sha256: "abc",
            snapshot: path.join(dayDir, "abc.html")
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
      path.join(process.cwd(), "tools", "sources", "extract_skeleton_facts.mjs"),
      "--snapshots",
      snapshotsDir,
      "--output",
      outputPath
    ],
    { stdio: "inherit" }
  );
  assert.equal(result.status, 0);

  const payload = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.ok(payload.entries.DE);
  assert.equal(payload.entries.DE.sources.length, 1);
  assert.ok(payload.entries.DE.sources[0].snapshot);
});
