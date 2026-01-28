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
  "Reports/",
  ".checkpoints/",
  "tools/wiki/",
  "tools/pass_cycle.sh",
  "tools/net/net_health.mjs",
  "tools/commit_if_green.sh",
  "tools/quality_gate.sh",
  ".gitignore",
  "CONTINUITY.md"
];
const noisyPrefixes = [
  "data/wiki/",
  "apps/web/",
  "Reports/",
  ".checkpoints/",
  "data/source_snapshots/",
  "data/baselines/",
  "data/import/",
  "Artifacts/",
  "GOLDEN.md"
];
const currentAll = [
  ...readList("git diff --name-only"),
  ...readList("git ls-files --others --exclude-standard")
];
const current = currentAll.filter((entry) => {
  if (noisyPrefixes.some((prefix) => entry.startsWith(prefix))) return false;
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

const scopeSpec = String(process.env.ALLOW_SCOPE_PATHS || "");
const scopePrefixes = scopeSpec
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => entry.replace(/\/\*\*$/, "/"));

const isInScope = (entry) =>
  scopePrefixes.length > 0 &&
  scopePrefixes.some((prefix) => entry === prefix || entry.startsWith(prefix));

if (OVERRIDE && scopePrefixes.length > 0) {
  const outOfScope = current.filter(
    (entry) => !isInScope(entry) && !baselineSet.has(entry)
  );
  if (outOfScope.length > 0) {
    const top10 = outOfScope.slice(0, 10).join(",");
    console.log(`GUARDS_COUNTS=total=${outOfScope.length},delta=${outOfScope.length}`);
    console.log(`GUARDS_TOP10=${top10 || "-"}`);
    console.log("SCOPE_VIOLATION=1");
    console.error(
      `ERROR: scope violation (${outOfScope.length}). Set ALLOW_SCOPE_OVERRIDE=0 or adjust ALLOW_SCOPE_PATHS.`
    );
    process.exit(1);
  }
  console.log("SCOPE_OK=1");
  process.exit(0);
}

if (newPaths.length > LIMIT && !OVERRIDE) {
  const top10 = newPaths.slice(0, 10).join(",");
  console.log(`GUARDS_COUNTS=total=${current.length},delta=${newPaths.length}`);
  console.log(`GUARDS_TOP10=${top10 || "-"}`);
  console.error(
    `ERROR: changed paths exceed ${LIMIT} (total=${current.length}, delta=${newPaths.length}). Set ALLOW_SCOPE_OVERRIDE=1 to override.`
  );
  process.exit(1);
}
