import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const INPUT_PATH = path.join(ROOT, "data", "sources", "portals_by_iso2.json");
const OUTPUT_PATH = path.join(ROOT, "data", "sources", "portals_by_iso2.validated.json");
const REPORT_PATH = path.join(ROOT, "Reports", "portals_import", "validate_last_run.json");
const DENY_SUBSTRINGS_PATH = path.join(ROOT, "data", "sources", "deny_substrings.json");
const DOMAIN_DENYLIST_PATH = path.join(ROOT, "data", "sources", "domain_denylist.json");

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

const denySub = readJson(DENY_SUBSTRINGS_PATH, { banned: [] });
const denyDomains = readJson(DOMAIN_DENYLIST_PATH, { banned: [] });
const denyTokens = new Set(
  [...(denySub.banned || []), ...(denyDomains.banned || [])]
    .map((item) => String(item || "").toLowerCase())
    .filter(Boolean)
);

function isDenied(hostname, url, note) {
  const haystack = `${hostname} ${url} ${note || ""}`.toLowerCase();
  for (const token of denyTokens) {
    if (!token) continue;
    if (haystack.includes(token)) return true;
  }
  return false;
}

function normalizeUrl(url) {
  let candidate = String(url || "").trim();
  if (!candidate) return null;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  candidate = candidate.replace(/^http:\/\//i, "https://");
  try {
    const parsed = new URL(candidate);
    return parsed.toString();
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "islegalcannabis/portals-validate"
      }
    });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

async function validateUrl(url, retries = 1) {
  const normalized = normalizeUrl(url);
  if (!normalized) return { status: "INVALID_URL", url };
  const parsed = new URL(normalized);
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const note = "";
  if (isDenied(hostname, normalized, note)) {
    return { status: "REJECTED_DENYLIST", url: normalized };
  }
  if (process.env.NETWORK !== "1") {
    return { status: "NO_NETWORK", url: normalized };
  }
  let attempt = 0;
  while (attempt <= retries) {
    try {
      const res = await fetchWithTimeout(normalized, 12000);
      const status = res.status;
      if (status >= 200 && status < 400) {
        return { status: status >= 300 ? "REDIRECT" : "OK", url: normalized, http_status: status };
      }
      if (status === 403) return { status: "403", url: normalized, http_status: status };
      if (status === 404) return { status: "404", url: normalized, http_status: status };
      if (status === 410) return { status: "410", url: normalized, http_status: status };
      return { status: String(status), url: normalized, http_status: status };
    } catch (err) {
      const name = err?.name || "";
      if (name === "AbortError") {
        attempt += 1;
        if (attempt > retries) return { status: "TIMEOUT", url: normalized };
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
        continue;
      }
      return { status: "FETCH_ERROR", url: normalized };
    }
  }
  return { status: "FETCH_ERROR", url: normalized };
}

const data = readJson(INPUT_PATH, {});
const report = {
  total: 0,
  validated: 0,
  rejected: 0,
  no_network: 0,
  by_status: {}
};

for (const record of Object.values(data)) {
  const portals = Array.isArray(record.portals) ? record.portals : [];
  const agencies = Array.isArray(record.us_fed_agencies) ? record.us_fed_agencies : [];
  for (const entry of [...portals, ...agencies]) {
    report.total += 1;
    const hostname = String(entry.domain || "").toLowerCase();
    if (isDenied(hostname, entry.url, entry.note)) {
      entry.portal_status = "REJECTED_DENYLIST";
      report.rejected += 1;
      report.by_status[entry.portal_status] = (report.by_status[entry.portal_status] || 0) + 1;
      continue;
    }
    const result = await validateUrl(entry.url, 1);
    entry.portal_status = result.status;
    if (result.http_status) entry.http_status = result.http_status;
    report.by_status[result.status] = (report.by_status[result.status] || 0) + 1;
    if (result.status === "NO_NETWORK") report.no_network += 1;
    else report.validated += 1;
  }
}

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2) + "\n");

console.log(
  `OK validate_portals total=${report.total} validated=${report.validated} rejected=${report.rejected} no_network=${report.no_network}`
);
