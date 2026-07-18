#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const args = new Map(process.argv.slice(2).map((value) => {
  const [key, ...rest] = value.split("=");
  return [key, rest.join("=") || true];
}));
const inputPath = path.resolve(ROOT, String(args.get("--input") || "data/official/cannabis_law_sources.audit.json"));
const outputPath = path.resolve(ROOT, String(args.get("--output") || "data/reviews/cannabis-law-source-probes.json"));
const geoFilter = String(args.get("--geo") || "").trim();
const limit = Math.max(0, Number(args.get("--limit") || 0));
const concurrency = Math.max(1, Math.min(8, Number(args.get("--concurrency") || 4)));
const timeoutMs = Math.max(5_000, Number(args.get("--timeout-ms") || 25_000));

const payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const selectedRows = (payload.rows || []).filter((row) => !geoFilter || row.geo === geoFilter);
const jobs = selectedRows.flatMap((row) => (row.sources || []).map((source, sourceIndex) => ({
  geo: row.geo,
  territory: row.territory,
  sourceIndex,
  source
})));
const selectedJobs = limit ? jobs.slice(0, limit) : jobs;

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function textFromHtml(html) {
  return normalizeWhitespace(decodeHtml(String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")));
}

function firstMatch(value, pattern) {
  const match = String(value || "").match(pattern);
  return normalizeWhitespace(decodeHtml(match?.[1] || ""));
}

function classifySoft404({ status, title, h1 }) {
  if (status === 404 || status === 410) return "HTTP_NOT_FOUND";
  const heading = `${title} ${h1}`.toLowerCase();
  if (/\b(page|document|resource)\s+(was\s+)?not\s+found\b|\b404\b|does not exist|cannot be found/.test(heading)) {
    return "SOFT_404_TEXT";
  }
  return "NONE";
}

async function probe(job) {
  const startedAt = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(job.source.url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "accept": "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.5",
        "user-agent": "isLegal-wiki-truth-audit/1.0 (+local evidence review)"
      }
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const isHtml = contentType.includes("html") || /^\s*</.test(bytes.subarray(0, 100).toString("utf8"));
    const rawText = isHtml ? bytes.toString("utf8") : "";
    const visibleText = isHtml ? textFromHtml(rawText) : "";
    const lowerText = visibleText.toLowerCase();
    const cannabisMatches = lowerText.match(/\b(cannabis|marijuana|marihuana|cannabidiol|tetrahydrocannabinol|thc)\b/g) || [];
    const title = isHtml ? firstMatch(rawText, /<title\b[^>]*>([\s\S]*?)<\/title>/i) : "";
    const h1 = isHtml ? firstMatch(rawText, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i) : "";
    const soft404 = classifySoft404({ status: response.status, title, h1 });
    const finalUrl = response.url || job.source.url;
    const requested = new URL(job.source.url);
    const final = new URL(finalUrl);
    const ok = response.ok && soft404 === "NONE" && (cannabisMatches.length > 0 || contentType.includes("pdf"));
    return {
      geo: job.geo,
      territory: job.territory,
      source_index: job.sourceIndex,
      requested_url: job.source.url,
      final_url: finalUrl,
      requested_host: requested.hostname,
      final_host: final.hostname,
      redirected: finalUrl !== job.source.url,
      cross_host_redirect: requested.hostname !== final.hostname,
      status: response.status,
      ok,
      content_type: contentType,
      bytes: bytes.length,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      page_title: title,
      h1,
      cannabis_term_hits: cannabisMatches.length,
      soft_404: soft404,
      visible_text_sample: visibleText.slice(0, 1200),
      probed_at: startedAt,
      error: null
    };
  } catch (error) {
    return {
      geo: job.geo,
      territory: job.territory,
      source_index: job.sourceIndex,
      requested_url: job.source.url,
      final_url: null,
      requested_host: new URL(job.source.url).hostname,
      final_host: null,
      redirected: false,
      cross_host_redirect: false,
      status: 0,
      ok: false,
      content_type: "",
      bytes: 0,
      sha256: null,
      page_title: "",
      h1: "",
      cannabis_term_hits: 0,
      soft_404: "UNCONFIRMED",
      visible_text_sample: "",
      probed_at: startedAt,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    };
  } finally {
    clearTimeout(timer);
  }
}

const results = new Array(selectedJobs.length);
let cursor = 0;
async function worker() {
  while (cursor < selectedJobs.length) {
    const index = cursor++;
    results[index] = await probe(selectedJobs[index]);
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, selectedJobs.length || 1) }, () => worker()));

const summary = {
  rows: selectedRows.length,
  urls: results.length,
  ok: results.filter((row) => row.ok).length,
  failed: results.filter((row) => !row.ok).length,
  redirected: results.filter((row) => row.redirected).length,
  cross_host_redirect: results.filter((row) => row.cross_host_redirect).length,
  soft_404: results.filter((row) => row.soft_404 !== "NONE").length,
  cannabis_term_missing: results.filter((row) => row.status > 0 && !row.content_type.includes("pdf") && row.cannabis_term_hits === 0).length
};
const output = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  input: path.relative(ROOT, inputPath),
  summary,
  results
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

console.log(`CANNABIS_LAW_SOURCE_PROBE rows=${summary.rows} urls=${summary.urls} ok=${summary.ok} failed=${summary.failed}`);
console.log(`CANNABIS_LAW_SOURCE_REDIRECT redirected=${summary.redirected} cross_host=${summary.cross_host_redirect} soft_404=${summary.soft_404}`);
console.log(`CANNABIS_LAW_SOURCE_MARKERS missing_html=${summary.cannabis_term_missing}`);
console.log(`CANNABIS_LAW_SOURCE_PROBE_OUTPUT=${path.relative(ROOT, outputPath)}`);
if (summary.failed) process.exitCode = 2;
