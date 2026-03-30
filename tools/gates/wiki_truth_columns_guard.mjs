import fs from "fs";

const FILE = "apps/web/src/app/wiki-truth/WikiTruthTable.tsx";
const source = fs.readFileSync(FILE, "utf8");

const requiredColumns = [
  "Rec (Wiki)",
  "Med (Wiki)",
  "Rec (Our)",
  "Med (Our)",
  "Official",
  "Official link",
  "Notes",
  "NotesLen",
  "NotesQuality",
  "MismatchFlags"
];

const missing = requiredColumns.filter((label) => !source.includes(`>${label}<`) && !source.includes(`"${label}"`));

for (const label of requiredColumns) {
  console.log(`WIKI_TRUTH_REQUIRED_COLUMN=${label}`);
}

if (missing.length) {
  console.log(`WIKI_TRUTH_COLUMNS_GUARD=FAIL missing=${missing.join(",")}`);
  process.exit(1);
}

console.log(`WIKI_TRUTH_COLUMNS_GUARD=PASS total=${requiredColumns.length}`);
