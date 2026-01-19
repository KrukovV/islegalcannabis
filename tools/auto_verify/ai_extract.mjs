import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function readArg(name, fallback = "") {
  const idx = process.argv.indexOf(name);
  if (idx !== -1) return process.argv[idx + 1] ?? fallback;
  const prefixed = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (prefixed) return prefixed.slice(name.length + 1);
  return fallback;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stripHtml(value) {
  return value.replace(/<[^>]+>/g, " ");
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function stripScriptsStylesNav(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ");
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

function findAnchorHtml(html) {
  const headingMatch = html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
  if (headingMatch) {
    const headingText = normalizeWhitespace(stripHtml(headingMatch[1] || ""));
    if (headingText) return { kind: "html_anchor", ref: headingText };
  }
  const idMatch = html.match(/\sid=["']([^"']+)["']/i);
  if (idMatch && idMatch[1]) return { kind: "html_anchor", ref: idMatch[1] };
  return null;
}

function detectStatuses(text) {
  const lower = text.toLowerCase();
  let recreational = "unknown";
  let medical = "unknown";

  if (/(illegal|prohibited)/.test(lower)) recreational = "illegal";
  if (lower.includes("decriminali")) recreational = "restricted";
  if (/\blegal\b/.test(lower)) recreational = "allowed";

  if (lower.includes("medical cannabis") || lower.includes("medicinal cannabis")) {
    medical = "allowed";
  } else if (lower.includes("prescription") || lower.includes("authorized")) {
    medical = "restricted";
  }

  return { recreational, medical };
}

function hasLawMarker(text) {
  const value = String(text || "");
  return [
    /\b(act|law|decree|gazette|legislation|statute|regulation|code|ordinance|bill|parliament)\b/i,
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
    /\b(cannabis|marijuana|hemp|thc|narcotic)\b/i,
    /\bcontrolled drug\b/i
  ].some((pattern) => pattern.test(value));
}

function findKeywordSnippet(text) {
  const lower = text.toLowerCase();
  const keywords = [
    "cannabis",
    "marijuana",
    "hemp",
    "thc",
    "controlled drug",
    "narcotic",
    "medical cannabis",
    "medicinal"
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
  const start = Math.max(0, matchIndex - 120);
  const end = Math.min(text.length, matchIndex + 120);
  return text.slice(start, end);
}

function buildEvidence(anchor, fields, snippet) {
  if (!anchor || fields.length === 0) return [];
  const cleaned = normalizeWhitespace(snippet).slice(0, 200);
  if (!cleaned) return [];
  if (hasBannedSnippet(cleaned) || hasBannedSnippet(anchor.ref || "")) return [];
  if (!hasCannabisMarker(cleaned)) return [];
  return fields.map((field) => ({
    field,
    kind: anchor.kind,
    ref: anchor.ref,
    quote: cleaned,
    snippet_hash: sha256(cleaned || "empty")
  }));
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
}

function main() {
  const iso2 = readArg("--iso2");
  const url = readArg("--url");
  const snapshotPath = readArg("--snapshot");
  const textPath = readArg("--text");
  const outPath = readArg("--out");
  const reportPath = readArg("--report");

  if (!iso2 || !snapshotPath || !outPath) {
    console.error("ERROR: missing required args");
    process.exit(1);
  }

  let text = "";
  let anchor = null;
  if (textPath && fs.existsSync(textPath)) {
    text = fs.readFileSync(textPath, "utf8");
    anchor = text.trim() ? { kind: "pdf_page", ref: "page=1" } : null;
  } else if (fs.existsSync(snapshotPath)) {
    const raw = fs.readFileSync(snapshotPath, "utf8");
    const isHtml = snapshotPath.endsWith(".html") || raw.includes("<html");
    if (isHtml) {
      const cleaned = stripScriptsStylesNav(raw);
      anchor = findAnchorHtml(cleaned);
      text = normalizeWhitespace(stripHtml(cleaned));
    }
  }

  const statuses = text
    ? detectStatuses(text)
    : { recreational: "unknown", medical: "unknown" };
  const lawMarker = hasLawMarker(text);
  const cannabisMarker = hasCannabisMarker(text);
  const fields = [];
  if (statuses.recreational !== "unknown") {
    fields.push("recreational_status");
  }
  if (statuses.medical !== "unknown") {
    fields.push("medical_status");
  }
  const snippet = findKeywordSnippet(text) || text;
  const evidence = buildEvidence(anchor, fields, snippet);
  const lawPage = lawMarker && cannabisMarker;
  const factsDelta = evidence.length > 0 && fields.length > 0 && lawPage ? 1 : 0;
  let reason = "NO_EVIDENCE";
  if (evidence.length > 0 && !lawPage) {
    reason = "NOT_LAW_PAGE";
  } else if (factsDelta) {
    reason = "OK";
  } else if (evidence.length > 0) {
    reason = "NO_SIGNAL";
  }
  const evidenceFields = new Set(evidence.map((item) => item.field));
  const confidence =
    fields.length > 0 && fields.every((field) => evidenceFields.has(field))
      ? "high"
      : "low";

  const payload = {
    iso2,
    recreational_status: statuses.recreational,
    medical_status: statuses.medical,
    evidence,
    confidence,
    generated_at: new Date().toISOString()
  };

  if (factsDelta > 0) {
    writeJson(outPath, payload);
  }

  if (reportPath) {
    writeJson(reportPath, {
      run_at: new Date().toISOString(),
      iso2,
      url,
      snapshot_path: snapshotPath,
      facts_delta: factsDelta,
      evidence_count: evidence.length,
      reason,
      out: factsDelta > 0 ? outPath : ""
    });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
