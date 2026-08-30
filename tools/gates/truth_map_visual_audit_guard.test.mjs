import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const guard = path.join(ROOT, "tools", "gates", "truth_map_visual_audit_guard.mjs");

test("truth-map visual guard accepts the current complete external audit", () => {
  const result = spawnSync(process.execPath, [guard], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout || result.stderr);
  assert.match(result.stdout, /TRUTH_MAP_VISUAL_AUDIT_GUARD=PASS/);
});

test("truth-map visual guard rejects a non-canonical capture manifest", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-truth-map-guard-"));
  const manifestPath = path.join(fixture, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify({ schemaVersion: 1, route: "/truth-map", requestedGeos: [], captured: 0, missing: [], rows: [] }));
  try {
    const result = spawnSync(process.execPath, [guard], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, TRUTH_MAP_VISUAL_AUDIT_MANIFEST: manifestPath },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /REQUESTED_GEO_SET_INVALID/);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
