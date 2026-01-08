import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TOP25_PATH = path.join(ROOT, "packages", "shared", "src", "top25.json");
const OUT_DIR = path.join(ROOT, "apps", "web", "src", "lib", "seo");
const OUT_FILE = path.join(OUT_DIR, "seoMap.generated.ts");

function main() {
  if (!fs.existsSync(TOP25_PATH)) {
    console.error(`Missing TOP25 source at ${TOP25_PATH}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(TOP25_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  const entries = parsed.map((entry) => ({
    jurisdictionKey: entry.jurisdictionKey,
    slug: entry.slug,
    displayName: entry.displayName ?? entry.slug
  }));

  entries.sort((a, b) => a.slug.localeCompare(b.slug));

  const header = `// GENERATED FILE. DO NOT EDIT.\n`;
  const body = `export const SEO_MAP = ${JSON.stringify(entries, null, 2)} as const;\n`;
  const typeDef = `export type SeoMapEntry = (typeof SEO_MAP)[number];\n`;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, `${header}${body}${typeDef}`);
  console.log(`Generated ${OUT_FILE} (${entries.length} entries).`);
}

main();
