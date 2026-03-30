#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const uiFiles = [
  "apps/web/src/app/_components/MapSection.tsx",
  "apps/web/src/app/wiki-truth/page.tsx",
  "apps/web/src/app/changes/page.tsx"
];

const violations = [];
for (const file of uiFiles) {
  const content = fs.readFileSync(path.join(ROOT, file), "utf8");
  if (/buildOfficialLinkOwnershipIndex\(/.test(content)) violations.push(`${file}:official_ownership_builder_in_ui`);
  if (/buildMapTruthDataset\(/.test(content) && !file.endsWith("MapSection.tsx")) violations.push(`${file}:map_truth_builder_in_ui`);
  if (/matchesOfficialGeoOwnership\(/.test(content)) violations.push(`${file}:official_match_logic_in_ui`);
}

console.log(`NO_SECOND_TRUTH_GUARD violations=${violations.length}`);
violations.forEach((line) => console.log(`NO_SECOND_TRUTH_VIOLATION ${line}`));
console.log(`NO_SECOND_TRUTH_GUARD=${violations.length > 0 ? "FAIL" : "PASS"}`);
process.exit(violations.length > 0 ? 1 : 0);
