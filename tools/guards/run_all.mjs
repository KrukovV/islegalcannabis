import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const guardsDir = path.resolve(process.cwd(), "tools/guards");
const entries = fs
  .readdirSync(guardsDir)
  .filter(
    (name) =>
      name.endsWith(".mjs") &&
      name !== "run_all.mjs" &&
      name !== "stdout_contract.mjs" &&
      name !== "no_bloat_markers.mjs" &&
      name !== "final_response_only.mjs" &&
      name !== "no_double_checkpoint.mjs" &&
      name !== "next_line.mjs" &&
      name !== "summary_format.mjs" &&
      name !== "sanitize_stdout.mjs" &&
      name !== "stdout_sanitize.mjs" &&
      !name.endsWith(".test.mjs")
  )
  .sort();

for (const name of entries) {
  const guardPath = path.join(guardsDir, name);
  const args = [guardPath];
  if (name === "summary_format.mjs") {
    args.push("--file", path.join(process.cwd(), ".checkpoints", "ci-summary.txt"));
  }
  if (name === "metrics_artifacts_guard.mjs") {
    args.push("--summary", path.join(process.cwd(), ".checkpoints", "ci-summary.txt"));
  }
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit"
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
