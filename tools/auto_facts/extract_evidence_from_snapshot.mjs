import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const OCR_SCRIPT = path.join(ROOT, "tools", "ocr", "ocr_pdf.sh");

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]+>/g, " ");
}

function stripScriptsStylesNav(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ");
}

function commandExists(command) {
  const res = spawnSync("bash", ["-lc", `command -v ${command}`], {
    stdio: "ignore"
  });
  return res.status === 0;
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function extractDocxText(snapshotPath) {
  if (!commandExists("unzip")) return "";
  const res = spawnSync("unzip", ["-p", snapshotPath, "word/document.xml"], {
    encoding: "utf8"
  });
  if (res.status !== 0) return "";
  return normalizeWhitespace(
    decodeXmlEntities(String(res.stdout || "")).replace(/<[^>]+>/g, " ")
  );
}

function extractDocText(snapshotPath) {
  if (commandExists("antiword")) {
    const res = spawnSync("antiword", [snapshotPath], { encoding: "utf8" });
    if (res.status === 0) return normalizeWhitespace(res.stdout || "");
  }
  if (commandExists("strings")) {
    const res = spawnSync("strings", [snapshotPath], { encoding: "utf8" });
    if (res.status === 0) return normalizeWhitespace(res.stdout || "");
  }
  return "";
}

function readSnapshotText(snapshotPath) {
  if (!fs.existsSync(snapshotPath)) return { text: "", anchor: "", kind: "" };
  if (snapshotPath.endsWith(".pdf")) {
    const ocrPath = path.join(path.dirname(snapshotPath), "ocr.txt");
    let text = "";
    if (fs.existsSync(OCR_SCRIPT)) {
      const res = spawnSync(OCR_SCRIPT, [snapshotPath, ocrPath], {
        stdio: "ignore"
      });
      if (res.status === 0 && fs.existsSync(ocrPath)) {
        text = fs.readFileSync(ocrPath, "utf8");
      }
    }
    return { text: normalizeWhitespace(text), anchor: "page-1", kind: "pdf" };
  }
  if (snapshotPath.endsWith(".docx")) {
    const text = extractDocxText(snapshotPath);
    return { text, anchor: "page-1", kind: "docx" };
  }
  if (snapshotPath.endsWith(".doc")) {
    const text = extractDocText(snapshotPath);
    return { text, anchor: "page-1", kind: "doc" };
  }
  const raw = fs.readFileSync(snapshotPath, "utf8");
  const cleaned = stripScriptsStylesNav(raw);
  const headingMatch = cleaned.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
  const anchor = headingMatch ? normalizeWhitespace(stripHtml(headingMatch[1] || "")) : "";
  const text = normalizeWhitespace(stripHtml(cleaned));
  return { text, anchor, kind: "html" };
}

function findKeywordSnippet(text) {
  const lower = text.toLowerCase();
  const keywords = [
    "cannabis",
    "marijuana",
    "marihuana",
    "marihuan",
    "hemp",
    "cannabidiol",
    "cbd",
    "thc",
    "tetrahydrocannabinol",
    "тгк",
    "kanabis",
    "hashash",
    "narkotik",
    "medical cannabis",
    "medicinal cannabis",
    "cannabis act",
    "narcotic",
    "controlled substance",
    "controlled drug",
    "decriminal",
    "psychoactive"
  ];
  let matchIndex = -1;
  for (const keyword of keywords) {
    const idx = lower.indexOf(keyword);
    if (idx >= 0) {
      matchIndex = idx;
      break;
    }
  }
  if (matchIndex < 0) return "";
  const start = Math.max(0, matchIndex - 80);
  const end = Math.min(text.length, matchIndex + 80);
  return text.slice(start, end);
}

function hasLawMarker(text) {
  const value = String(text || "");
  return [
    /\b(act|law|decree|gazette|legislation|statute|regulation|code|ordinance|bill|parliament|no\.)\b/i,
    /\bofficial journal\b/i,
    /\bjournal officiel\b/i,
    /\bofficial gazette\b/i,
    /\bgazette officielle\b/i,
    /\breglamento\b/i,
    /\bley\b/i,
    /\bdecreto\b/i,
    /\blegge\b/i,
    /\bgazzetta\b/i,
    /\bgesetz\b/i,
    /\bloi\b/i,
    /\bordonnance\b/i
  ].some((pattern) => pattern.test(value));
}

function hasCannabisMarker(text) {
  const value = String(text || "");
  return [
    /\b(cannabis|marijuana|marihuana|hemp|thc|cbd|cannabidiol|narcotic|hashish|ganja|tetrahydrocannabinol|kanabis|hashash)\b/i,
    /\bmarihuan[ae\u00eb]\b/i,
    /\bnarkotik[e\u00eb]?\b/i,
    /\b(тгк)\b/i,
    /\bcontrolled drug\b/i
  ].some((pattern) => pattern.test(value));
}

function hasBannedSnippet(value) {
  const lower = String(value || "").toLowerCase();
  return [
    "window.",
    "function(",
    "<script",
    ".js",
    ".css",
    "intl.segmenter"
  ].some((token) => lower.includes(token));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    snapshot: "",
    url: "",
    out: "",
    iso2: ""
  };
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i + 1];
    if (args[i] === "--snapshot" && value) options.snapshot = value;
    if (args[i] === "--url" && value) options.url = value;
    if (args[i] === "--out" && value) options.out = value;
    if (args[i] === "--iso2" && value) options.iso2 = value.toUpperCase();
  }
  return options;
}

function writeReport(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
}

function main() {
  const { snapshot, url, out, iso2 } = parseArgs();
  if (!snapshot || !out || !url || !iso2) {
    console.error("ERROR: missing args");
    process.exit(1);
  }
  if (!fs.existsSync(snapshot)) {
    writeReport(out, {
      iso2,
      url,
      snapshot_ref: snapshot,
      evidence_ok: 0,
      reason: "SNAPSHOT_MISSING"
    });
    process.exit(2);
  }
  const { text, anchor, kind } = readSnapshotText(snapshot);
  const snippet = findKeywordSnippet(text);
  const quote = normalizeWhitespace(snippet).slice(0, 120);
  const lawMarker = hasLawMarker(quote);
  const cannabisMarker = hasCannabisMarker(quote);
  const candidateOk =
    Boolean(anchor) &&
    Boolean(quote) &&
    !hasBannedSnippet(quote) &&
    !hasBannedSnippet(anchor) &&
    fs.existsSync(snapshot);
  const evidenceOk = candidateOk && lawMarker && cannabisMarker;
  const evidence = candidateOk
    ? [
        {
          type: kind === "pdf" ? "pdf_page" : "html_anchor",
          anchor: kind === "pdf" ? null : anchor,
          page: kind === "pdf" ? "1" : null,
          quote,
          snapshot_ref: snapshot,
          snippet_hash: sha256(`${anchor}|${quote}`)
        }
      ]
    : [];
  const evidenceKind = lawMarker && cannabisMarker ? "law" : "non_law";
  writeReport(out, {
    iso2,
    url,
    snapshot_ref: snapshot,
    evidence_ok: evidenceOk ? 1 : 0,
    anchor,
    quote,
    evidence,
    evidence_kind: evidenceKind,
    law_marker_found: lawMarker,
    cannabis_marker_found: cannabisMarker,
    reason: evidenceOk
      ? "OK"
      : candidateOk
        ? cannabisMarker
          ? "NOT_LAW_PAGE"
          : "NO_MARKER"
        : evidenceKind === "law"
          ? "NO_ANCHOR"
          : "NOT_LAW_PAGE"
  });
  process.exit(evidenceOk ? 0 : 2);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
