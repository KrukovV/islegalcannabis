import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const SNAPSHOT_DIR = path.join(ROOT, "data", "sources", "ssot_snapshots");
const SNAPSHOT_PATH = path.join(SNAPSHOT_DIR, "latest.json");

test("ssot diff runner returns changed when snapshot hash is tampered", () => {
  const backup = fs.existsSync(SNAPSHOT_PATH)
    ? fs.readFileSync(SNAPSHOT_PATH, "utf8")
    : null;
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

  try {
    const baseline = spawnSync(process.execPath, [
      path.join(ROOT, "tools", "ssot", "ssot_diff_run.mjs")
    ]);
    assert.equal(baseline.status, 0, "baseline run should exit 0");

    const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
    const entries = snapshot.entries || {};
    const [firstId] = Object.keys(entries);
    assert.ok(firstId, "snapshot should contain entries");
    entries[firstId].hash = `${entries[firstId].hash}-tampered`;
    fs.writeFileSync(
      SNAPSHOT_PATH,
      JSON.stringify({ ...snapshot, entries }, null, 2) + "\n"
    );

    const result = spawnSync(process.execPath, [
      path.join(ROOT, "tools", "ssot", "ssot_diff_run.mjs")
    ]);
    assert.equal(result.status, 3, "diff should report changes");
  } finally {
    if (backup !== null) {
      fs.writeFileSync(SNAPSHOT_PATH, backup);
    }
  }
});
