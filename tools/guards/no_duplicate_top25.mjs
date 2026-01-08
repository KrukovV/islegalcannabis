import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SSOT_PATH = path.join(ROOT, "packages", "shared", "src", "top25.json");
const DUP_PATH = path.join(ROOT, "data", "seo", "start_top25.json");

if (!fs.existsSync(SSOT_PATH)) {
  console.error("ERROR: Missing SSOT file packages/shared/src/top25.json.");
  process.exit(1);
}

if (fs.existsSync(DUP_PATH)) {
  console.error(
    "ERROR: Duplicate TOP25 list found at data/seo/start_top25.json. Use only packages/shared/src/top25.json."
  );
  process.exit(1);
}
