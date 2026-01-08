import { spawnSync } from "node:child_process";

function hasCmd(cmd) {
  const result = spawnSync(cmd, ["--version"], { stdio: "ignore" });
  return result.status === 0;
}

const pattern = "Implement " + "{feature}";
const excludeArgs = ["--glob", "!tools/ci-local.sh", "--glob", "!tools/guards/forbid_placeholder_text.mjs"];

if (hasCmd("rg")) {
  const result = spawnSync(
    "rg",
    ["-n", ...excludeArgs, pattern, "."],
    { encoding: "utf8" }
  );
  if (result.stdout && result.stdout.trim()) {
    process.stdout.write(result.stdout);
    console.error("ERROR: forbidden placeholder text found.");
    process.exit(1);
  }
} else {
  const result = spawnSync(
    "grep",
    ["-R", "-n", "--exclude=tools/ci-local.sh", "--exclude=tools/guards/forbid_placeholder_text.mjs", pattern, "."],
    { encoding: "utf8" }
  );
  if (result.stdout && result.stdout.trim()) {
    process.stdout.write(result.stdout);
    console.error("ERROR: forbidden placeholder text found.");
    process.exit(1);
  }
}
