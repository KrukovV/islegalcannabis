import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const LIMIT = 25;
const OVERRIDE = process.env.ALLOW_SCOPE_OVERRIDE === "1";
const ROOT = process.cwd();
const BASELINE_PATH = path.join(ROOT, ".checkpoints", "baseline_paths.txt");

function readList(command) {
  try {
    const output = execSync(command, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    return output ? output.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

const allowedPrefixes = [
  "data/wiki/",
  "tools/wiki/",
  "tools/pass_cycle.sh",
  "tools/net/net_health.mjs",
  "tools/commit_if_green.sh",
  "tools/quality_gate.sh",
  ".gitignore",
  "CONTINUITY.md"
];
const current = [
  ...readList("git diff --name-only"),
  ...readList("git ls-files --others --exclude-standard")
].filter((entry) => {
  if (entry.startsWith("Reports/") || entry.startsWith("data/source_snapshots/")) {
    return false;
  }
  return !allowedPrefixes.some((prefix) => entry === prefix || entry.startsWith(prefix));
});

const baseline = fs.existsSync(BASELINE_PATH)
  ? fs
      .readFileSync(BASELINE_PATH, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
  : [];
const baselineSet = new Set(baseline);
const newPaths = current.filter((entry) => !baselineSet.has(entry));

if (newPaths.length > LIMIT && !OVERRIDE) {
  console.error(
    `ERROR: changed paths exceed ${LIMIT} (total=${current.length}, delta=${newPaths.length}). Set ALLOW_SCOPE_OVERRIDE=1 to override.`
  );
  process.exit(1);
}
