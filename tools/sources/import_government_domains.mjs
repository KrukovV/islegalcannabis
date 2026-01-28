import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SEED_PATH = path.join(ROOT, "data", "sources", "government_domains_seed.txt");
const CATALOG_PATH = path.join(ROOT, "data", "sources", "official_catalog.json");
const REPORT_PATH = path.join(
  ROOT,
  "Reports",
  "sources",
  "government_domains_additions.json"
);

const DOMAIN_MAP = [
  { iso: "RU", domain: "gosuslugi.ru", kind: "government_portal" },
  { iso: "RU", domain: "nalog.ru", kind: "government_portal" },
  { iso: "RU", domain: "mos.ru", kind: "government_portal" },
  { iso: "BR", domain: "gov.br", kind: "government_portal" },
  { iso: "BR", domain: "acesso.gov.br", kind: "government_portal" },
  { iso: "BR-SP", domain: "sp.gov.br", kind: "government_portal" },
  { iso: "BR-MG", domain: "mg.gov.br", kind: "government_portal" },
  { iso: "BR-RJ", domain: "rj.gov.br", kind: "government_portal" },
  { iso: "TR", domain: "turkiye.gov.tr", kind: "government_portal" },
  { iso: "TR", domain: "meb.gov.tr", kind: "government_portal" },
  { iso: "TR", domain: "saglik.gov.tr", kind: "government_portal" },
  { iso: "JP", domain: "mhlw.go.jp", kind: "government_portal" },
  { iso: "JP", domain: "nta.go.jp", kind: "government_portal" },
  { iso: "JP", domain: "mlit.go.jp", kind: "government_portal" },
  { iso: "JP", domain: "japanpost.jp", kind: "government_portal_secondary" },
  { iso: "GB", domain: "gov.uk", kind: "government_portal" },
  { iso: "GB", domain: "service.gov.uk", kind: "government_portal" },
  { iso: "GB", domain: "royalmail.com", kind: "government_portal_secondary" },
  { iso: "CA", domain: "canada.ca", kind: "government_portal" },
  { iso: "US", domain: "login.gov", kind: "government_portal" },
  { iso: "US", domain: "ssa.gov", kind: "government_portal" },
  { iso: "US", domain: "studentaid.gov", kind: "government_portal" },
  { iso: "US", domain: "state.gov", kind: "government_portal" },
  { iso: "US", domain: "irs.gov", kind: "government_portal" },
  { iso: "US-CA", domain: "ca.gov", kind: "government_portal" },
  { iso: "US-NY", domain: "ny.gov", kind: "government_portal" },
  { iso: "MX", domain: "gob.mx", kind: "government_portal" },
  { iso: "MX", domain: "sat.gob.mx", kind: "government_portal" },
  { iso: "FR", domain: "franceconnect.gouv.fr", kind: "government_portal" },
  { iso: "FR", domain: "impots.gouv.fr", kind: "government_portal" },
  { iso: "FR", domain: "service-public.gouv.fr", kind: "government_portal" },
  { iso: "FR", domain: "laposte.fr", kind: "government_portal_secondary" },
  { iso: "ID", domain: "pajak.go.id", kind: "government_portal" },
  { iso: "IN", domain: "uidai.gov.in", kind: "government_portal" },
  { iso: "IN", domain: "eci.gov.in", kind: "government_portal" },
  { iso: "IN", domain: "gst.gov.in", kind: "government_portal" },
  { iso: "IN", domain: "epfindia.gov.in", kind: "government_portal" },
  { iso: "IN-RJ", domain: "rajasthan.gov.in", kind: "government_portal" },
  { iso: "IN-BR", domain: "bihar.gov.in", kind: "government_portal" },
  { iso: "IN-TN", domain: "tn.gov.in", kind: "government_portal" },
  { iso: "IN-WB", domain: "wb.gov.in", kind: "government_portal" },
  { iso: "IN-MH", domain: "maharashtra.gov.in", kind: "government_portal" },
  { iso: "AU", domain: "my.gov.au", kind: "government_portal" },
  { iso: "AU-NSW", domain: "nsw.gov.au", kind: "government_portal" },
  { iso: "PE", domain: "sunat.gob.pe", kind: "government_portal" },
  { iso: "EU", domain: "europa.eu", kind: "government_portal" },
  { iso: "CN", domain: "english.www.gov.cn", kind: "government_portal" },
  { iso: "VN", domain: "thuvienphapluat.vn", kind: "neutral_reference" },
  { iso: "BR", domain: "correios.com.br", kind: "government_portal_secondary" },
  { iso: "NL", domain: "postnl.nl", kind: "government_portal_secondary" },
  { iso: "deny", domain: "satta-king-fast.com", kind: "deny" }
];

function readSeed() {
  if (!fs.existsSync(SEED_PATH)) return [];
  return fs
    .readFileSync(SEED_PATH, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((domain) => domain.toLowerCase());
}

function toUrl(domain) {
  const cleaned = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `https://${cleaned}/`;
}

function readCatalog() {
  if (!fs.existsSync(CATALOG_PATH)) return {};
  return JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, `${file}.bak.${ts}`);
  }
  const tmpPath = `${file}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2) + "\n");
  fs.renameSync(tmpPath, file);
}

function pushUnique(list, value) {
  if (!value) return list;
  if (!list.includes(value)) list.push(value);
  return list;
}

function main() {
  const seed = readSeed();
  const catalog = readCatalog();
  const additions = {};
  const skipped = [];
  const missingIso = [];
  const secondary = [];
  const denied = [];

  const mapping = new Map(DOMAIN_MAP.map((entry) => [entry.domain, entry]));

  for (const domain of seed) {
    const entry = mapping.get(domain);
    if (!entry) {
      skipped.push(domain);
      continue;
    }
    if (entry.kind === "deny") {
      denied.push(domain);
      continue;
    }
    const url = toUrl(domain);
    const key = entry.iso;
    additions[key] = additions[key] || {};
    const bucket = additions[key];
    if (entry.kind === "government_portal_secondary") {
      bucket.government_portal_secondary = bucket.government_portal_secondary || [];
      pushUnique(bucket.government_portal_secondary, url);
      secondary.push(domain);
      continue;
    }
    if (entry.kind === "neutral_reference") {
      bucket.neutral_reference = bucket.neutral_reference || [];
      pushUnique(bucket.neutral_reference, url);
      continue;
    }
    bucket.government_portal = bucket.government_portal || [];
    pushUnique(bucket.government_portal, url);
  }

  for (const [iso, payload] of Object.entries(additions)) {
    if (!catalog[iso] || typeof catalog[iso] !== "object") {
      missingIso.push(iso);
      continue;
    }
    const entry = catalog[iso];
    if (payload.government_portal) {
      const next = Array.isArray(entry.government_portal)
        ? [...entry.government_portal]
        : [];
      for (const url of payload.government_portal) pushUnique(next, url);
      entry.government_portal = next;
    }
    if (payload.government_portal_secondary) {
      const next = Array.isArray(entry.government_portal_secondary)
        ? [...entry.government_portal_secondary]
        : [];
      for (const url of payload.government_portal_secondary) pushUnique(next, url);
      entry.government_portal_secondary = next;
    }
    if (payload.neutral_reference && Array.isArray(entry.neutral_reference)) {
      const next = [...entry.neutral_reference];
      for (const url of payload.neutral_reference) pushUnique(next, url);
      entry.neutral_reference = next;
    }
  }

  const sortedCatalog = Object.fromEntries(
    Object.entries(catalog).sort(([a], [b]) => a.localeCompare(b))
  );
  writeJson(CATALOG_PATH, sortedCatalog);

  writeJson(REPORT_PATH, {
    additions,
    stats: {
      total_seed: seed.length,
      iso_keys: Object.keys(additions).length,
      secondary_domains: secondary.length,
      denied_domains: denied.length,
      skipped_domains: skipped.length
    },
    secondary,
    denied,
    skipped,
    missing_iso: missingIso
  });

  console.log(
    `OK import_government_domains additions=${Object.keys(additions).length} secondary=${secondary.length} denied=${denied.length} skipped=${skipped.length}`
  );
}

main();
