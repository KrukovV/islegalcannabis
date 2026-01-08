import { spawnSync } from "node:child_process";
import fs from "node:fs";

const tscPath = "./node_modules/.bin/tsc";
if (!fs.existsSync(tscPath)) {
  console.error("ERROR: tsc not found at ./node_modules/.bin/tsc.");
  process.exit(1);
}

const result = spawnSync(tscPath, ["-p", "packages/shared/tsconfig.json", "--noEmit"], {
  stdio: "inherit"
});
if (result.status !== 0) {
  console.error("ERROR: shared typecheck failed (packages/shared/tsconfig.json).");
  process.exit(result.status ?? 1);
}
