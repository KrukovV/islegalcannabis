import fs from "node:fs/promises";
import path from "node:path";
import { deriveCountryCardEntryFromCountryPageData } from "../src/lib/countryCardEntry";
import { getCountryPageData, listCountryPageCodes } from "../src/lib/countryPageStorage";
import { collectPopupComparableText } from "../src/lib/popupComparableText";

type AuditRow = {
  code: string;
  geo: string;
  name: string;
  popup_items: number;
  popup_chars: number;
  seo_items: number;
  seo_chars: number;
  missing_items: string[];
  ok: boolean;
};

function repoRoot() {
  const fromWorkspace = path.resolve(process.cwd(), "..", "..");
  return path.basename(process.cwd()) === "web" && path.basename(path.dirname(process.cwd())) === "apps"
    ? fromWorkspace
    : process.cwd();
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeText(value: string) {
  return decodeHtmlEntities(String(value || ""))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function toCsv(rows: AuditRow[]) {
  const header = ["code", "geo", "name", "popup_items", "popup_chars", "seo_items", "seo_chars", "missing_items", "ok"];
  const lines = [header.join(",")];
  for (const row of rows) {
    const values = [
      row.code,
      row.geo,
      row.name,
      row.popup_items,
      row.popup_chars,
      row.seo_items,
      row.seo_chars,
      row.missing_items.join("|"),
      row.ok ? "1" : "0"
    ].map((value) => `"${String(value).replace(/"/g, '""')}"`);
    lines.push(values.join(","));
  }
  return `${lines.join("\n")}\n`;
}

async function fetchHtml(baseUrl: string, code: string) {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/c/${code}`, {
        headers: {
          Accept: "text/html",
          Connection: "close"
        }
      });
      if (!response.ok) {
        throw new Error(`SEO_PAGE_FETCH_FAILED:${code}:${response.status}`);
      }
      return response.text();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`SEO_PAGE_FETCH_FAILED:${code}`);
}

async function main() {
  const root = repoRoot();
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
  const rows: AuditRow[] = [];

  for (const code of listCountryPageCodes()) {
    const data = getCountryPageData(code);
    if (!data) throw new Error(`COUNTRY_PAGE_MISSING:${code}`);
    const popupItems = collectPopupComparableText(deriveCountryCardEntryFromCountryPageData(data));
    const html = normalizeText(await fetchHtml(baseUrl, code));
    const missingItems = popupItems.filter((item) => !html.includes(normalizeText(item)));
    const visibleItems = popupItems.filter((item) => !missingItems.includes(item));

    rows.push({
      code,
      geo: data.geo_code,
      name: data.name,
      popup_items: popupItems.length,
      popup_chars: popupItems.join(" ").length,
      seo_items: visibleItems.length,
      seo_chars: visibleItems.join(" ").length,
      missing_items: missingItems,
      ok: missingItems.length === 0
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  const summary = {
    generated_at: new Date().toISOString(),
    base_url: baseUrl,
    total: rows.length,
    popup_profiles: rows.filter((row) => row.popup_items > 0).length,
    mismatch_count: rows.filter((row) => !row.ok).length,
    rows
  };

  const jsonPath = path.join(root, "Reports", "popup-seo-content-audit.json");
  const csvPath = path.join(root, "Reports", "popup-seo-content-audit.csv");
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
  await fs.writeFile(csvPath, toCsv(rows));
  console.warn(`POPUP_SEO_AUDIT_JSON=${path.relative(root, jsonPath)}`);
  console.warn(`POPUP_SEO_AUDIT_CSV=${path.relative(root, csvPath)}`);
  console.warn(`POPUP_SEO_AUDIT_BASE_URL=${baseUrl}`);
  console.warn(`POPUP_SEO_AUDIT_TOTAL=${summary.total}`);
  console.warn(`POPUP_SEO_AUDIT_POPUP_PROFILES=${summary.popup_profiles}`);
  console.warn(`POPUP_SEO_AUDIT_MISMATCHES=${summary.mismatch_count}`);
}

void main();
