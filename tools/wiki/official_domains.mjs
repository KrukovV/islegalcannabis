import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SSOT_PATH = path.join(ROOT, "data", "official", "official_domains.ssot.json");

function normalizeHost(value) {
  if (!value) return "";
  let host = String(value);
  try {
    if (host.includes("://")) {
      host = new URL(host).hostname;
    }
  } catch {
    // leave as-is
  }
  return String(host || "").toLowerCase().replace(/^www\./, "");
}

function loadOfficialDomains() {
  if (!fs.existsSync(SSOT_PATH)) {
    return new Set();
  }
  const payload = JSON.parse(fs.readFileSync(SSOT_PATH, "utf8"));
  const domains = Array.isArray(payload?.domains) ? payload.domains : [];
  return new Set(domains.map((entry) => normalizeHost(entry)).filter(Boolean));
}

function isOfficialDomain(host, domainsSet) {
  if (!host) return false;
  const normalized = normalizeHost(host);
  return domainsSet.has(normalized);
}

export { loadOfficialDomains, isOfficialDomain, normalizeHost };
