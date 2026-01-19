import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
}

test("render_learned_sources_line uses per-iso hosts", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilc-learned-"));
  const prevCwd = process.cwd();
  try {
    process.chdir(tmpDir);
    writeJson(path.join(tmpDir, "Reports", "auto_learn", "last_run.json"), {
      entries: [
        { iso2: "AA", final_url: "https://alpha.gov/one", snapshot_path: "/tmp/a" },
        { iso2: "BB", final_url: "https://beta.gov/two", snapshot_path: "/tmp/b" }
      ]
    });
    const scriptPath = path.join(
      prevCwd,
      "tools",
      "auto_train",
      "render_learned_sources_line.mjs"
    );
    const result = spawnSync(process.execPath, [scriptPath], { encoding: "utf8" });
    assert.equal(result.status, 0);
    const line = result.stdout.trim();
    assert.ok(line.includes("alpha.gov"));
    assert.ok(line.includes("beta.gov"));
  } finally {
    process.chdir(prevCwd);
  }
});
