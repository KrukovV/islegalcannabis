import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

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
        "Paths: total=0 delta=0",
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
