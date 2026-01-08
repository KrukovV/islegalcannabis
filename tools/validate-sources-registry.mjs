import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REGISTRY_PATH = path.join(ROOT, "data", "sources_registry", "top50.json");

function scoreUrl(url) {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 0.4;
  }
  if (host.startsWith("www.")) {
    host = host.slice(4);
  }

  const highTrustPatterns = [
    ".gov",
    ".gouv.",
    ".gob.",
    ".bund.de",
    ".admin.ch",
    ".gov.uk",
    ".gov.au",
    ".govt.nz",
    ".gc.ca",
    ".gov.sg",
    ".gov.il",
    ".gov.za",
    ".gov.ph",
    ".go.jp",
    ".go.kr",
    ".go.id",
    ".go.th"
  ];

  const isHighTrust = highTrustPatterns.some((pattern) => {
    if (host === pattern) {
      return true;
    }
    if (pattern.startsWith(".")) {
      const bare = pattern.slice(1);
      if (host === bare) {
        return true;
      }
    }
    return host.includes(pattern) || host.endsWith(pattern);
  });

  if (isHighTrust) {
    return 1.0;
  }

  const officialPortals = new Set([
    "government.nl",
    "service-public.fr",
    "governo.it",
    "portugal.gov.pt",
    "gov.pl",
    "gov.ie",
    "regjeringen.no",
    "government.se",
    "borger.dk",
    "oesterreich.gv.at",
    "vlada.cz",
    "bund.de",
    "admin.ch",
    "u.ae",
    "vietnam.gov.vn",
    "indonesia.go.id",
    "malaysia.gov.my",
    "turkiye.gov.tr",
    "gov.il",
    "gov.sg",
    "gov.za",
    "canada.ca",
    "thaigov.go.th",
    "myflorida.com"
  ]);

  if (officialPortals.has(host)) {
    return 0.7;
  }

  return 0.4;
}

function validateSources(list, label, issues) {
  if (!Array.isArray(list)) return;
  for (const source of list) {
    if (!source || typeof source.url !== "string") {
      issues.push(`${label}: url must be a string`);
      continue;
    }
    if (!source.url.startsWith("https://")) {
      issues.push(`${label}: url must start with https://`);
    }
    if (/\s/.test(source.url)) {
      issues.push(`${label}: url contains whitespace`);
    }
    const weight = source.weight;
    if (typeof weight !== "number" || weight < 0.1 || weight > 1.0) {
      issues.push(`${label}: weight must be 0.1..1.0`);
    }
    const trust = scoreUrl(source.url);
    if (label.includes("officialSources") && trust < 0.7) {
      issues.push(`${label}: official source trust too low`);
    }
  }
}

function main() {
  if (!fs.existsSync(REGISTRY_PATH)) {
    console.error(`Missing ${REGISTRY_PATH}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(REGISTRY_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  const issues = [];

  if (parsed.version !== 1) {
    issues.push("version must be 1");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed.generated_at ?? "")) {
    issues.push("generated_at must be YYYY-MM-DD");
  }
  if (!Array.isArray(parsed.items)) {
    issues.push("items must be an array");
  }

  const seen = new Set();
  for (const [index, item] of (parsed.items ?? []).entries()) {
    const key = item?.jurisdictionKey;
    if (!key || typeof key !== "string") {
      issues.push(`items[${index}]: jurisdictionKey required`);
      continue;
    }
    if (seen.has(key)) {
      issues.push(`items[${index}]: duplicate jurisdictionKey ${key}`);
    }
    seen.add(key);
    if (item.kind !== "country" && item.kind !== "adm1") {
      issues.push(`items[${index}]: invalid kind`);
    }
    if (typeof item.displayName !== "string") {
      issues.push(`items[${index}]: displayName required`);
    }
    validateSources(item.officialSources, `items[${index}].officialSources`, issues);
    validateSources(item.fallbackSources, `items[${index}].fallbackSources`, issues);
  }

  if (issues.length > 0) {
    console.error("sources_registry validation failed:");
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log(`Validated sources_registry top50 (${seen.size} items).`);
}

main();
