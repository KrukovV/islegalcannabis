import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { nearestLegalBorder } from "../geo/nearest_legal.mjs";

test("run_all executes discovered guards", () => {
  const guardsDir = path.resolve(process.cwd(), "tools/guards");
  const marker = path.join(os.tmpdir(), `ilc-guard-marker-${Date.now()}`);
  const guardPath = path.join(guardsDir, `temp_guard_${process.pid}.mjs`);
  const checkpointsDir = path.join(process.cwd(), ".checkpoints");
  const summaryFile = path.join(checkpointsDir, "ci-summary.txt");

  fs.writeFileSync(
    guardPath,
    `import fs from "node:fs"; fs.writeFileSync("${marker}", "ok");`
  );

  try {
    fs.mkdirSync(checkpointsDir, { recursive: true });
    fs.writeFileSync(
      summaryFile,
      [
        "🌿 CI PASS (Smoke 0/0)",
        "Checked: 0 (sources=0/0; n/a)",
        "Trace top10: n/a",
        "Checked top10: n/a",
        "Checked saved: Reports/checked/last_checked.json",
        "Trends: skipped",
        "ISO Coverage: covered=0, missing=0, delta=+0",
        "Law Corpus: total_iso=0 laws_files_total=0 (world=0, eu=0) missing=0",
        "Law Verified: known=0 needs_review=0 provisional_with_sources=0 provisional_no_sources=0 missing_sources=0",
        "ISO batch: +0 provisional, missing now=0",
        "TOP50_INGEST: added=0 updated=0 missing_official=0",
        "SSOT Diff: skipped",
        "PROMOTION: promoted=0 rejected=0",
        "Checkpoint: .checkpoints/00000000-000000.patch",
        "Next: 1) Placeholder."
      ].join("\n")
    );
    const result = spawnSync(process.execPath, [path.join(guardsDir, "run_all.mjs")], {
      stdio: "ignore"
    });
    assert.equal(result.status, 0, "run_all should pass");
    assert.equal(fs.existsSync(marker), true, "marker should be created");
  } finally {
    if (fs.existsSync(summaryFile)) fs.unlinkSync(summaryFile);
    if (fs.existsSync(marker)) fs.unlinkSync(marker);
    if (fs.existsSync(guardPath)) fs.unlinkSync(guardPath);
  }
});

test("nearestLegalBorder picks closest green centroid", () => {
  const current = { lat: 41.8781, lon: -87.6298, statusLevel: "red" };
  const candidates = [
    { id: "US-IL", statusLevel: "green", lat: 41.8781, lon: -87.6298 },
    { id: "CA-ON", statusLevel: "green", lat: 43.6532, lon: -79.3832 },
    { id: "US-IN", statusLevel: "red", lat: 39.7684, lon: -86.1581 }
  ];
  const result = nearestLegalBorder(current, candidates);
  assert.ok(result);
  assert.equal(result.id, "US-IL");
  assert.ok(result.distanceKm >= 0);
});
