import path from "node:path";

const ROOT = process.cwd();
const SSOT_OFFICIAL_PATH = path.join(ROOT, "data", "official", "official_domains.ssot.json");
const SSOT_WIKI_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");

export { SSOT_OFFICIAL_PATH, SSOT_WIKI_PATH };
