import fs from "node:fs";
import path from "node:path";

const BASE_DIR =
  typeof import.meta.dirname === "string"
    ? import.meta.dirname
    : path.dirname(new URL(import.meta.url).pathname);
let ROOT = process.env.PROJECT_ROOT ?? path.resolve(BASE_DIR, "../../..");
if (!fs.existsSync(path.join(ROOT, "tools", "wiki"))) {
  ROOT = path.resolve(BASE_DIR, "../..");
}
if (!fs.existsSync(path.join(ROOT, "tools", "wiki"))) {
  console.error("NOTES_REGRESS_FAIL reason=ROOT_NOT_RESOLVED");
  process.exit(2);
}
if (process.cwd() !== ROOT) {
  process.chdir(ROOT);
}

const claimsPath = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");
const baselinePath = path.join(ROOT, "data", "baselines", "notes_regress.json");
if (!fs.existsSync(claimsPath)) {
  console.log("NOTES_REGRESS_FAIL reason=MISSING_SSOT");
  process.exit(1);
}
const payload = JSON.parse(fs.readFileSync(claimsPath, "utf8"));
const claims = payload?.items || {};

const args = process.argv.slice(2);
let geos = ["RO", "RU", "AU"];
const idx = args.indexOf("--geos");
if (idx !== -1) {
  const raw = String(args[idx + 1] || "");
  geos = raw.split(",").map((g) => g.trim().toUpperCase()).filter(Boolean);
}
const minLen = Number(process.env.NOTES_REGRESS_MIN_LEN || 80);
let fail = 0;

const isPlaceholder = (text) => {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  if (/^Main articles?:/i.test(normalized)) return true;
  if (/^Main article:/i.test(normalized)) return true;
  if (/^Cannabis in\s+/i.test(normalized)) return true;
  return false;
};

const baseline = fs.existsSync(baselinePath)
  ? JSON.parse(fs.readFileSync(baselinePath, "utf8"))
  : { geos: {} };

for (const geo of geos) {
  const entry = claims[geo];
  const notesText = String(entry?.notes_text || "");
  const preview = notesText.replace(/\s+/g, " ").slice(0, 160);
  const len = notesText.length;
  const placeholder = isPlaceholder(notesText);
  const expected = baseline?.geos?.[geo];
  let ok = true;
  let reason = "OK";
  if (!entry || !Object.prototype.hasOwnProperty.call(entry, "notes_text")) {
    ok = false;
    reason = "MISSING_FIELD";
  } else if (!notesText) {
    ok = false;
    reason = "EMPTY";
  } else if (placeholder) {
    ok = false;
    reason = "PLACEHOLDER";
  } else if (len < minLen) {
    ok = false;
    reason = "TOO_SHORT";
  } else if (!expected?.preview) {
    ok = false;
    reason = "BASELINE_MISSING";
  } else if (expected?.preview) {
    const expectedPreview = String(expected.preview || "").trim();
    if (!notesText.replace(/\s+/g, " ").startsWith(expectedPreview)) {
      ok = false;
      reason = "NOTES_REGRESS";
    }
  }
  if (!ok) {
    fail += 1;
    console.log(`NOTES_REGRESS_FAIL geo=${geo} reason=${reason} notes_len=${len} preview="${preview}"`);
  } else {
    console.log(`NOTES_REGRESS_OK geo=${geo} notes_len=${len} preview="${preview}"`);
  }
}

if (fail > 0) {
  console.log(`NOTES_REGRESS_OK=0 fail=${fail} reason=NOTES_REGRESS`);
  process.exit(1);
}
console.log("NOTES_REGRESS_OK=1 fail=0");
