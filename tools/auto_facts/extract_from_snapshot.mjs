import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { isOfficialUrl } from "../sources/validate_official_url.mjs";
import { writeMachineVerifiedEntries } from "../legal_ssot/write_machine_verified.mjs";

const ROOT = process.cwd();
const OUTPUT_PATH = path.join(ROOT, "data", "legal_ssot", "machine_verified.json");
const DEFAULT_REPORT_PATH = path.join(ROOT, "Reports", "auto_facts", "last_run.json");
const MODEL_ID = "auto_facts_rules_v1";
const OCR_SCRIPT = path.join(ROOT, "tools", "ocr", "ocr_pdf.sh");
const VISION_SCRIPT = path.join(ROOT, "tools", "ocr", "ocr_vision.swift");
const PDF_TEXT_MIN = Number(process.env.PDF_TEXT_MIN || 400);
const EVIDENCE_WINDOW_CHARS = Number(process.env.EVIDENCE_WINDOW_CHARS || 320);
const EVIDENCE_STATUS_WINDOW_CHARS = Number(process.env.EVIDENCE_STATUS_WINDOW_CHARS || 900);
const MAX_SNIPPET_LEN = Number(process.env.EVIDENCE_SNIPPET_MAX || 260);
const STATUS_WINDOW_CHARS = Number(process.env.STATUS_WINDOW_CHARS || 360);

const STATUS_PATTERNS = [
  {
    type: "PROHIBITED",
    re: /\b(prohibit(ed)?|illegal|unlawful|forbidden|shall be punished|shall be penalized|ndalohet|i ndaluar|e ndaluar|zabranjen[oa]?|zabranjeno)\b/i
  },
  {
    type: "DECRIMINALIZED",
    re: /\bdecriminali[sz]ed|not subject to criminal (penalty|liability)|administrative fine|dekriminalizovano|dekriminalizirano\b/i
  },
  {
    type: "MEDICAL_ALLOWED",
    re: /\bmedical (use|cannabis)|medicinal cannabis|therapeutic use|mjek[eë]sor|p[eë]rdorim mjek[eë]sor|medicinska upotreba\b/i
  },
  {
    type: "RECREATIONAL_ALLOWED",
    re: /\brecreational|adult use|non-medical use|rekreativ\b/i
  },
  {
    type: "LIMITED_USE",
    re: /\blimited use|only for|restricted to|vet[eë]m p[eë]r|vetem per\b/i
  },
  {
    type: "THC_THRESHOLD",
    re: /\bthc\b.*(%|percent)|(%|percent)\s*thc\b/i
  },
  { type: "EXCEPTION_ONLY", re: /\bexception|except|exempt|p[eë]rjashtim|izuzetak\b/i }
];

const STATUS_SCOPE_PATTERNS = [
  { label: "possession", re: /\bpossession\b/i },
  { label: "cultivation", re: /\bcultivation|grow|growing\b/i },
  { label: "sale", re: /\bsale|selling|supply|distribution\b/i },
  { label: "medical", re: /\bmedical|medicinal|therapeutic\b/i },
  { label: "research", re: /\bresearch|scientific\b/i },
  { label: "import", re: /\bimport|export\b/i }
];

const STATUS_VERB_RE = /\b(is|are|shall be|may be|must be|is not|are not|prohibit(ed)?|illegal|unlawful|permitted|allowed|authorized|restricted|limited|decriminali[sz]ed|ndalohet|lejohet|dozvoljeno|zabranjeno)\b/i;

const CANNABIS_MARKERS = [
  { label: "cannabis", re: /\bcannabis\b/i },
  { label: "marijuana", re: /\bmarijuana\b/i },
  { label: "marihuana", re: /\bmarihuana\b/i },
  { label: "hemp", re: /\bhemp\b/i },
  { label: "cbd", re: /\bcbd\b/i },
  { label: "thc", re: /\bthc\b/i },
  { label: "tetrahydrocannabinol", re: /\btetrahydrocannabinol\b/i },
  { label: "cannabinoid", re: /\bcannabinoid\b/i },
  { label: "hashish", re: /\bhashish\b/i },
  { label: "ganja", re: /\bganja\b/i },
  { label: "kanabis", re: /\bkanabis\b/i },
  { label: "marihuana_sq", re: /\bmarihuan[ae\u00eb]\b/i },
  { label: "hashash", re: /\bhashash\b/i },
  { label: "narkotik", re: /\bnarkotik[e\u00eb]?\b/i },
  { label: "controlled_substance", re: /\bcontrolled substance\b/i },
  { label: "cannabis_medical", re: /\bmedical cannabis\b/i },
  { label: "medicinal_cannabis", re: /\bmedicinal cannabis\b/i },
  { label: "kanabis", re: /\u043a\u0430\u043d\u043d\u0430\u0431\u0438\u0441/i },
  { label: "konopl", re: /\u043a\u043e\u043d\u043e\u043f\u043b/i },
  { label: "marihuana_cyr", re: /\u043c\u0430\u0440\u0438\u0445\u0443\u0430\u043d/i },
  { label: "hashish_cyr", re: /\u0433\u0430\u0448\u0438\u0448/i },
  { label: "tgk", re: /\u0442\u0433\u043a/i }
];

const CANNABIS_BINDING_MARKERS = [
  { label: "cannabis", re: /\bcannabis\b/i },
  { label: "marijuana", re: /\bmarijuana\b/i },
  { label: "marihuana", re: /\bmarihuana\b/i },
  { label: "hemp", re: /\bhemp\b/i },
  { label: "cbd", re: /\bcbd\b/i },
  { label: "thc", re: /\bthc\b/i },
  { label: "tetrahydrocannabinol", re: /\btetrahydrocannabinol\b/i },
  { label: "cannabinoid", re: /\bcannabinoid\b/i },
  { label: "hashish", re: /\bhashish\b/i },
  { label: "ganja", re: /\bganja\b/i },
  { label: "kanabis", re: /\bkanabis\b/i },
  { label: "marihuana_sq", re: /\bmarihuan[ae\u00eb]\b/i },
  { label: "hashash", re: /\bhashash\b/i },
  { label: "kanabis_cyr", re: /\u043a\u0430\u043d\u043d\u0430\u0431\u0438\u0441/i },
  { label: "konopl", re: /\u043a\u043e\u043d\u043e\u043f\u043b/i },
  { label: "marihuana_cyr", re: /\u043c\u0430\u0440\u0438\u0445\u0443\u0430\u043d/i },
  { label: "hashish_cyr", re: /\u0433\u0430\u0448\u0438\u0448/i },
  { label: "tgk", re: /\u0442\u0433\u043a/i }
];

function readArg(name, fallback = "") {
  const idx = process.argv.indexOf(name);
  if (idx !== -1) return process.argv[idx + 1] ?? fallback;
  const prefixed = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (prefixed) return prefixed.slice(name.length + 1);
  return fallback;
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
}

function updateSnapshotMeta(snapshotPath, updates = {}) {
  if (!snapshotPath) return;
  const metaPath = path.join(path.dirname(snapshotPath), "meta.json");
  if (!fs.existsSync(metaPath)) return;
  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch {
    return;
  }
  const items = Array.isArray(meta?.items) ? meta.items : [];
  const match = items.find((item) => item?.snapshot === snapshotPath);
  if (!match) return;
  let changed = false;
  for (const [key, value] of Object.entries(updates)) {
    if (typeof value === "undefined" || value === null) continue;
    if (match[key] !== value) {
      match[key] = value;
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
  }
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
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

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stripDiacritics(value) {
  try {
    return value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  } catch {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
}

function normalizeEvidenceText(value) {
  const raw = String(value || "");
  const normalized = raw
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, "\"")
    .replace(/[\u2010-\u2015\u2212]/g, "-");
  return normalizeWhitespace(stripDiacritics(normalized).toLowerCase());
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function commandExists(command) {
  const res = spawnSync("bash", ["-lc", `command -v ${command}`], {
    stdio: "ignore"
  });
  return res.status === 0;
}

function runVisionOcr(snapshotPath, ocrPath) {
  if (process.platform !== "darwin") {
    return { ok: false, reason: "VISION_UNAVAILABLE" };
  }
  if (!commandExists("swift")) {
    return { ok: false, reason: "VISION_UNAVAILABLE" };
  }
  if (!fs.existsSync(VISION_SCRIPT)) {
    return { ok: false, reason: "VISION_UNAVAILABLE" };
  }
  const res = spawnSync("swift", [VISION_SCRIPT, snapshotPath, ocrPath], {
    stdio: "ignore",
    env: {
      ...process.env,
      OCR_PAGE_LIMIT: process.env.OCR_PAGE_LIMIT || "10"
    }
  });
  if (res.status === 0 && fs.existsSync(ocrPath)) {
    return { ok: true };
  }
  return { ok: false, reason: "VISION_FAILED" };
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
    /\bordonnance\b/i,
    /\bligj\b/i,
    /\bneni\b/i,
    /\budh[eë]zim administrativ\b/i,
    /\bgazeta zyrtare\b/i,
    /\bzakon\b/i,
    /\buredba\b/i,
    /\bpravilnik\b/i
  ].some((pattern) => pattern.test(value));
}

function countLawStructure(text) {
  const value = String(text || "");
  return [
    /\b(article|section|chapter)\b/i,
    /\b(no\.|number|nr\.)\b/i,
    /\b(date|dated|published|entered into force)\b/i,
    /\b(official journal|official gazette|gazeta zyrtare)\b/i
  ].reduce((count, pattern) => (pattern.test(value) ? count + 1 : count), 0);
}

function isLawContainerUrl(url) {
  if (!url) return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();
  if (!host.endsWith("rks-gov.net")) return false;
  if (path.includes("actdocumentdetail.aspx")) return true;
  if (path.includes("actdetail.aspx")) return true;
  return /(actslist|actsbycategory|listofsubnormacts)/i.test(path);
}

function isLawPageLikely(text, url) {
  const lawMarker = hasLawMarker(text);
  const structure = countLawStructure(text);
  const container = isLawContainerUrl(url);
  return {
    ok: (lawMarker && structure >= 1) || container,
    law_marker: lawMarker,
    structure
  };
}

function isDocumentSnapshot(snapshotPath) {
  const lower = String(snapshotPath || "").toLowerCase();
  return lower.endsWith(".pdf") || lower.endsWith(".doc") || lower.endsWith(".docx");
}

function isNormativeDoc(text) {
  const value = String(text || "");
  if (!value) return false;
  if (/(strategy|strategi|raport|report|news|press release|press|njoftim|lajm)/i.test(value)) {
    return false;
  }
  const lawMarker = hasLawMarker(value);
  const structure = countLawStructure(value);
  const authority =
    /\b(ministry|minist(er|ry)|government|parliament|assembly|gazette|official journal|official gazette|gazeta zyrtare)\b/i.test(
      value
    );
  return lawMarker && (structure >= 1 || authority);
}

function hasCannabisMarker(text) {
  return CANNABIS_MARKERS.some((marker) => marker.re.test(String(text || "")));
}

function hasCannabisBindingMarker(text) {
  return CANNABIS_BINDING_MARKERS.some((marker) => marker.re.test(String(text || "")));
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

function findKeywordSnippet(text) {
  const lower = text.toLowerCase();
  let matchIndex = -1;
  for (const marker of CANNABIS_MARKERS) {
    const idx = lower.search(marker.re);
    if (idx >= 0) {
      matchIndex = idx;
      break;
    }
  }
  const keywords = [
    "cannabis",
    "narcotic",
    "controlled",
    "hemp",
    "hashish",
    "ganja",
    "kanabis",
    "marihuana",
    "marihuan",
    "hashash",
    "narkotik",
    "cbd",
    "thc",
    "medical use",
    "medicinal",
    "decriminal",
    "possession",
    "drug law",
    "psychoactive"
  ];
  if (matchIndex < 0) {
    for (const keyword of keywords) {
      const idx = lower.indexOf(keyword);
      if (idx >= 0) {
        matchIndex = idx;
        break;
      }
    }
  }
  if (matchIndex < 0) return "";
  const start = Math.max(0, matchIndex - 120);
  const end = Math.min(text.length, matchIndex + 120);
  return text.slice(start, end);
}

function ensureGlobalRegex(regex) {
  if (!regex || !(regex instanceof RegExp)) return null;
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  return new RegExp(regex.source, flags);
}

function findMarkerOffsets(text) {
  const hits = [];
  for (const marker of CANNABIS_MARKERS) {
    const re = ensureGlobalRegex(marker.re);
    if (!re) continue;
    let match;
    while ((match = re.exec(text)) !== null) {
      if (!match[0]) break;
      hits.push({ label: marker.label, index: match.index, match: match[0] });
    }
  }
  return hits;
}

export function snippetContainsMarker(snippet, marker) {
  if (!snippet || !marker) return false;
  const normalized = normalizeEvidenceText(snippet);
  const re = ensureGlobalRegex(marker.re);
  if (!re) return false;
  re.lastIndex = 0;
  return re.test(normalized);
}

function snippetContainsBindingMarker(snippet) {
  if (!snippet) return false;
  return CANNABIS_BINDING_MARKERS.some((marker) => snippetContainsMarker(snippet, marker));
}

function hasStatusPattern(snippet) {
  if (!snippet) return false;
  return STATUS_PATTERNS.some((pattern) => pattern.re.test(snippet));
}

function buildSnippet(text, index, windowChars) {
  if (!text) return "";
  const half = Math.max(0, Math.floor(windowChars / 2));
  const start = Math.max(0, index - half);
  const end = Math.min(text.length, index + half);
  return text.slice(start, end);
}

function extractConditions(snippet) {
  const matches = [];
  const value = String(snippet || "");
  const amountRe = /\b\d+(?:[\.,]\d+)?\s*(%|percent|mg|g|grams|ml|months|years)\b/gi;
  let match;
  while ((match = amountRe.exec(value)) !== null) {
    if (match[0]) matches.push(match[0]);
  }
  return Array.from(new Set(matches)).join(", ");
}

function extractEffectiveDate(snippet) {
  const value = String(snippet || "");
  const yearMatch = value.match(/\b(19|20)\d{2}\b/);
  return yearMatch ? yearMatch[0] : "";
}

function extractJurisdictionLevel(snippet) {
  const value = String(snippet || "").toLowerCase();
  if (/federal|state|province|regional|municipal|local/.test(value)) return "regional";
  if (/national|republic|state law|law on/.test(value)) return "national";
  return "national";
}

function extractStatusClaim(text) {
  const normalized = normalizeEvidenceText(text);
  const candidates = [];
  let unboundMatches = 0;
  let patternHits = 0;
  for (const pattern of STATUS_PATTERNS) {
    const re = ensureGlobalRegex(pattern.re);
    if (!re) continue;
    let match;
    while ((match = re.exec(normalized)) !== null) {
      patternHits += 1;
      const snippet = buildSnippet(normalized, match.index, STATUS_WINDOW_CHARS);
      if (!STATUS_VERB_RE.test(snippet)) continue;
      const bindingMarkers = CANNABIS_BINDING_MARKERS.filter((marker) =>
        ensureGlobalRegex(marker.re)?.test(snippet)
      ).map((marker) => marker.label);
      if (bindingMarkers.length === 0) {
        unboundMatches += 1;
        continue;
      }
      const scopes = STATUS_SCOPE_PATTERNS.filter((entry) => entry.re.test(snippet)).map(
        (entry) => entry.label
      );
      candidates.push({
        type: pattern.type,
        status_pattern: match[0],
        snippet: normalizeWhitespace(snippet).slice(0, MAX_SNIPPET_LEN),
        scope: scopes,
        conditions: extractConditions(snippet),
        jurisdiction_level: extractJurisdictionLevel(snippet),
        effective_date: extractEffectiveDate(snippet),
        markers_in_snippet: bindingMarkers,
        cannabis_bound: true
      });
    }
  }
  if (!candidates.length) {
    return {
      type: "UNKNOWN",
      scope: [],
      conditions: "",
      jurisdiction_level: "national",
      effective_date: "",
      snippet: "",
      markers_in_snippet: [],
      cannabis_bound: false,
      status_pattern: "",
      reason: patternHits > 0 && unboundMatches > 0 ? "NO_CANNABIS_BOUND_STATUS" : "NO_STATUS_CLAIM"
    };
  }
  const priority = STATUS_PATTERNS.map((entry) => entry.type);
  candidates.sort((a, b) => {
    const leftRank = priority.indexOf(a.type);
    const rightRank = priority.indexOf(b.type);
    if (leftRank !== rightRank) return leftRank - rightRank;
    if (a.markers_in_snippet.length !== b.markers_in_snippet.length) {
      return b.markers_in_snippet.length - a.markers_in_snippet.length;
    }
    return a.snippet.length - b.snippet.length;
  });
  return candidates[0];
}

function findAnchor(html) {
  const headingMatch = html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
  if (headingMatch) {
    const headingText = normalizeWhitespace(stripHtml(headingMatch[1] || ""));
    if (headingText) return headingText;
  }
  const idMatch = html.match(/\sid=["']([^"']+)["']/i);
  if (idMatch && idMatch[1]) return idMatch[1];
  return null;
}

function detectStatuses(text) {
  const lower = text.toLowerCase();
  let statusRecreational = "unknown";
  let statusMedical = "unknown";

  if (/(illegal|prohibited)/.test(lower)) statusRecreational = "illegal";
  if (lower.includes("decriminali")) statusRecreational = "decriminalized";
  if (/\blegal\b/.test(lower)) statusRecreational = "legal";

  if (lower.includes("medical cannabis") || lower.includes("medicinal cannabis")) {
    statusMedical = "legal";
  } else if (lower.includes("prescription") || lower.includes("authorized")) {
    statusMedical = "decriminalized";
  }

  return { statusRecreational, statusMedical };
}

function detectRestrictedNotes(text) {
  const lower = text.toLowerCase();
  if (lower.includes("restricted") || lower.includes("only") || lower.includes("permit")) {
    return normalizeWhitespace(text).slice(0, 180);
  }
  return null;
}

function collectMarkerHits(text) {
  const hits = [];
  const value = String(text || "");
  for (const marker of CANNABIS_MARKERS) {
    if (marker.re.test(value)) hits.push(marker.label);
  }
  return hits;
}

function extractDocxText(snapshotPath) {
  if (!commandExists("unzip")) return { text: "", source: "docx_missing_unzip" };
  const res = spawnSync("unzip", ["-p", snapshotPath, "word/document.xml"], {
    encoding: "utf8"
  });
  if (res.status !== 0) return { text: "", source: "docx_unzip_failed" };
  const cleaned = decodeXmlEntities(String(res.stdout || "")).replace(/<[^>]+>/g, " ");
  return { text: normalizeWhitespace(cleaned), source: "docx_unzip" };
}

function extractDocText(snapshotPath) {
  if (commandExists("antiword")) {
    const res = spawnSync("antiword", [snapshotPath], { encoding: "utf8" });
    if (res.status === 0) {
      return { text: normalizeWhitespace(res.stdout || ""), source: "antiword" };
    }
  }
  if (commandExists("strings")) {
    const res = spawnSync("strings", [snapshotPath], { encoding: "utf8" });
    if (res.status === 0) {
      return { text: normalizeWhitespace(res.stdout || ""), source: "strings" };
    }
  }
  return { text: "", source: "doc_unavailable" };
}

function extractPdfText(snapshotPath) {
  const ocrPath = path.join(path.dirname(snapshotPath), "ocr.txt");
  const visionAvailable =
    process.platform === "darwin" && commandExists("swift") && fs.existsSync(VISION_SCRIPT);
  const fallbackEngine = commandExists("ocrmypdf")
    ? "ocrmypdf"
    : commandExists("tesseract")
      ? "tesseract"
      : "";
  const forceOcr = process.env.OCR_FORCE === "1";
  if (fs.existsSync(ocrPath)) {
    const cached = fs.readFileSync(ocrPath, "utf8");
    const normalized = normalizeWhitespace(cached);
    return {
      text: normalized,
      source: "ocr_cached",
      ocr_ran: true,
      ocr_failed: false,
      ocr_engine: visionAvailable ? "vision" : fallbackEngine,
      ocr_text_path: ocrPath,
      ocr_pages: ["all"],
      ocr_text_len: normalized.length,
      text_layer_len: 0,
      has_text_layer: false,
      ocr_reason: ""
    };
  }
  let text = "";
  let source = "none";
  if (commandExists("pdftotext")) {
    const res = spawnSync("pdftotext", ["-layout", "-q", snapshotPath, "-"], {
      encoding: "utf8"
    });
    if (res.status === 0) {
      text = res.stdout || "";
      source = "pdftotext";
    }
  }
  const normalized = normalizeWhitespace(text);
  const hasTextLayer = normalized.length > 0;
  if (!forceOcr && normalized.length >= PDF_TEXT_MIN) {
    return {
      text: normalized,
      source,
      ocr_ran: false,
      ocr_failed: false,
      ocr_engine: visionAvailable ? "vision" : fallbackEngine,
      ocr_text_path: "",
      ocr_pages: [],
      ocr_text_len: 0,
      text_layer_len: normalized.length,
      has_text_layer: hasTextLayer,
      ocr_reason: ""
    };
  }
  if (visionAvailable) {
    const vision = runVisionOcr(snapshotPath, ocrPath);
    if (vision.ok && fs.existsSync(ocrPath)) {
      const ocrText = fs.readFileSync(ocrPath, "utf8");
      const normalizedOcr = normalizeWhitespace(ocrText);
      return {
        text: normalizedOcr,
        source: "ocr_vision",
        ocr_ran: true,
        ocr_failed: false,
        ocr_engine: "vision",
        ocr_text_path: ocrPath,
        ocr_pages: ["all"],
        ocr_text_len: normalizedOcr.length,
        text_layer_len: normalized.length,
        has_text_layer: hasTextLayer,
        ocr_reason: normalizedOcr.length ? "" : "OCR_EMPTY"
      };
    }
  }
  if (fs.existsSync(OCR_SCRIPT)) {
    const res = spawnSync(OCR_SCRIPT, [snapshotPath, ocrPath], {
      stdio: "ignore"
    });
    if (res.status === 0 && fs.existsSync(ocrPath)) {
      const ocrText = fs.readFileSync(ocrPath, "utf8");
      const normalizedOcr = normalizeWhitespace(ocrText);
      return {
        text: normalizedOcr,
        source: "ocr",
        ocr_ran: true,
        ocr_failed: false,
        ocr_engine: fallbackEngine,
        ocr_text_path: ocrPath,
        ocr_pages: ["all"],
        ocr_text_len: normalizedOcr.length,
        text_layer_len: normalized.length,
        has_text_layer: hasTextLayer,
        ocr_reason: normalizedOcr.length ? "" : "OCR_EMPTY"
      };
    }
  }
  return {
    text: normalized,
    source,
    ocr_ran: false,
    ocr_failed: true,
    ocr_engine: visionAvailable ? "vision" : fallbackEngine,
    ocr_text_path: "",
    ocr_pages: [],
    ocr_text_len: 0,
    text_layer_len: normalized.length,
    has_text_layer: hasTextLayer,
    ocr_reason: "OCR_FAILED"
  };
}

function extractImageText(snapshotPath) {
  const ocrPath = path.join(path.dirname(snapshotPath), "ocr.txt");
  const visionAvailable =
    process.platform === "darwin" && commandExists("swift") && fs.existsSync(VISION_SCRIPT);
  const ocrEngine = commandExists("tesseract") ? "tesseract" : "";
  if (fs.existsSync(ocrPath)) {
    const cached = fs.readFileSync(ocrPath, "utf8");
    const normalized = normalizeWhitespace(cached);
    return {
      text: normalized,
      source: "ocr_cached",
      ocr_ran: true,
      ocr_failed: false,
      ocr_engine: visionAvailable ? "vision" : ocrEngine,
      ocr_text_path: ocrPath,
      ocr_pages: ["all"],
      ocr_text_len: normalized.length,
      text_layer_len: 0,
      has_text_layer: false,
      ocr_reason: ""
    };
  }
  if (visionAvailable) {
    const vision = runVisionOcr(snapshotPath, ocrPath);
    if (vision.ok && fs.existsSync(ocrPath)) {
      const ocrText = fs.readFileSync(ocrPath, "utf8");
      const normalizedOcr = normalizeWhitespace(ocrText);
      return {
        text: normalizedOcr,
        source: "ocr_vision",
        ocr_ran: true,
        ocr_failed: false,
        ocr_engine: "vision",
        ocr_text_path: ocrPath,
        ocr_pages: ["all"],
        ocr_text_len: normalizedOcr.length,
        text_layer_len: 0,
        has_text_layer: false,
        ocr_reason: normalizedOcr.length ? "" : "OCR_EMPTY"
      };
    }
  }
  if (commandExists("tesseract")) {
    const res = spawnSync("tesseract", [snapshotPath, ocrPath.replace(/\.txt$/, "")], {
      stdio: "ignore"
    });
    if (res.status === 0 && fs.existsSync(ocrPath)) {
      const ocrText = fs.readFileSync(ocrPath, "utf8");
      const normalizedOcr = normalizeWhitespace(ocrText);
      return {
        text: normalizedOcr,
        source: "ocr",
        ocr_ran: true,
        ocr_failed: false,
        ocr_engine: ocrEngine,
        ocr_text_path: ocrPath,
        ocr_pages: ["all"],
        ocr_text_len: normalizedOcr.length,
        text_layer_len: 0,
        has_text_layer: false,
        ocr_reason: normalizedOcr.length ? "" : "OCR_EMPTY"
      };
    }
  }
  return {
    text: "",
    source: "none",
    ocr_ran: false,
    ocr_failed: true,
    ocr_engine: ocrEngine,
    ocr_text_path: "",
    ocr_pages: [],
    ocr_text_len: 0,
    text_layer_len: 0,
    has_text_layer: false,
    ocr_reason: "OCR_FAILED"
  };
}

function readSnapshotText(snapshotPath) {
  if (!fs.existsSync(snapshotPath)) {
    return {
      text: "",
      anchor: null,
      kind: "",
      text_len: 0,
      text_source: "none",
      ocr_ran: false,
      ocr_failed: false,
      has_text_layer: false,
      extracted_text_len: 0,
      ocr_text_len: 0,
      ocr_text_path: "",
      ocr_engine: "",
      ocr_pages: [],
      ocr_reason: "",
      ocr_required: false
    };
  }
  if (snapshotPath.endsWith(".pdf")) {
    const {
      text,
      source,
      ocr_ran,
      ocr_failed,
      ocr_engine,
      ocr_text_path,
      ocr_pages,
      ocr_text_len,
      text_layer_len,
      has_text_layer,
      ocr_reason
    } = extractPdfText(snapshotPath);
    const normalized = normalizeWhitespace(text);
    const snippet = findKeywordSnippet(normalized);
    if (normalized) {
      const textPath = path.join(path.dirname(snapshotPath), "extracted_text.txt");
      fs.writeFileSync(textPath, normalized + "\n");
    }
    const ocrRequired = process.env.OCR_FORCE === "1" || text_layer_len < PDF_TEXT_MIN;
    return {
      text: normalized,
      snippet,
      anchor: { type: "pdf_page", page: "1", anchor: null },
      kind: "pdf",
      text_len: normalized.length,
      text_source: source,
      ocr_ran,
      ocr_failed,
      has_text_layer,
      extracted_text_len: text_layer_len,
      ocr_text_len,
      ocr_text_path,
      ocr_engine,
      ocr_pages,
      ocr_reason,
      ocr_required: ocrRequired
    };
  }
  if (/\.(png|jpe?g|tiff|bmp)$/i.test(snapshotPath)) {
    const {
      text,
      source,
      ocr_ran,
      ocr_failed,
      ocr_engine,
      ocr_text_path,
      ocr_pages,
      ocr_text_len,
      text_layer_len,
      has_text_layer,
      ocr_reason
    } = extractImageText(snapshotPath);
    const normalized = normalizeWhitespace(text);
    const snippet = findKeywordSnippet(normalized);
    if (normalized) {
      const textPath = path.join(path.dirname(snapshotPath), "extracted_text.txt");
      fs.writeFileSync(textPath, normalized + "\n");
    }
    return {
      text: normalized,
      snippet,
      anchor: { type: "img_page", page: "1", anchor: null },
      kind: "image",
      text_len: normalized.length,
      text_source: source,
      ocr_ran,
      ocr_failed,
      has_text_layer,
      extracted_text_len: text_layer_len,
      ocr_text_len,
      ocr_text_path,
      ocr_engine,
      ocr_pages,
      ocr_reason,
      ocr_required: true
    };
  }
  if (snapshotPath.endsWith(".docx")) {
    const { text, source } = extractDocxText(snapshotPath);
    const normalized = normalizeWhitespace(text);
    const snippet = findKeywordSnippet(normalized);
    if (normalized) {
      const textPath = path.join(path.dirname(snapshotPath), "extracted_text.txt");
      fs.writeFileSync(textPath, normalized + "\n");
    }
    return {
      text: normalized,
      snippet,
      anchor: { type: "doc_page", page: "1", anchor: null },
      kind: "docx",
      text_len: normalized.length,
      text_source: source,
      ocr_ran: false,
      ocr_failed: false,
      has_text_layer: false,
      extracted_text_len: normalized.length,
      ocr_text_len: 0,
      ocr_text_path: "",
      ocr_engine: "",
      ocr_pages: [],
      ocr_reason: "",
      ocr_required: false
    };
  }
  if (snapshotPath.endsWith(".doc")) {
    const { text, source } = extractDocText(snapshotPath);
    const normalized = normalizeWhitespace(text);
    const snippet = findKeywordSnippet(normalized);
    if (normalized) {
      const textPath = path.join(path.dirname(snapshotPath), "extracted_text.txt");
      fs.writeFileSync(textPath, normalized + "\n");
    }
    return {
      text: normalized,
      snippet,
      anchor: { type: "doc_page", page: "1", anchor: null },
      kind: "doc",
      text_len: normalized.length,
      text_source: source,
      ocr_ran: false,
      ocr_failed: false,
      has_text_layer: false,
      extracted_text_len: normalized.length,
      ocr_text_len: 0,
      ocr_text_path: "",
      ocr_engine: "",
      ocr_pages: [],
      ocr_reason: "",
      ocr_required: false
    };
  }
  const raw = fs.readFileSync(snapshotPath, "utf8");
  const cleaned = stripScriptsStylesNav(raw);
  const anchorText = findAnchor(cleaned);
  const anchor = anchorText
    ? { type: "html_anchor", page: null, anchor: anchorText }
    : null;
  const normalized = normalizeWhitespace(stripHtml(cleaned));
  const snippet = findKeywordSnippet(normalized);
  if (normalized) {
    const textPath = path.join(path.dirname(snapshotPath), "extracted_text.txt");
    fs.writeFileSync(textPath, normalized + "\n");
  }
  return {
    text: normalized,
    snippet,
    anchor,
    kind: "html",
    text_len: normalized.length,
    text_source: "html",
    ocr_ran: false,
    ocr_failed: false,
    has_text_layer: false,
    extracted_text_len: normalized.length,
    ocr_text_len: 0,
    ocr_text_path: "",
    ocr_engine: "",
    ocr_pages: [],
    ocr_reason: "",
    ocr_required: false
  };
}

export function buildEvidenceFromText(anchor, snapshotPath, text, contentHash) {
  if (!anchor) {
    return { evidence: [], guard: { tried: 0, rejected: 0, reasons: {} } };
  }
  const normalized = normalizeEvidenceText(text);
  const hits = findMarkerOffsets(normalized);
  const evidence = [];
  const reasons = {};
  let rejected = 0;
  for (const hit of hits) {
    let snippet = buildSnippet(normalized, hit.index, EVIDENCE_WINDOW_CHARS);
    if (!hasStatusPattern(snippet)) {
      const expanded = buildSnippet(normalized, hit.index, EVIDENCE_STATUS_WINDOW_CHARS);
      if (hasStatusPattern(expanded)) {
        snippet = expanded;
      }
    }
    const cleaned = normalizeWhitespace(snippet).slice(0, MAX_SNIPPET_LEN);
    if (!cleaned) {
      rejected += 1;
      reasons.NO_EVIDENCE = (reasons.NO_EVIDENCE || 0) + 1;
      continue;
    }
    const marker = CANNABIS_MARKERS.find((item) => item.label === hit.label);
    if (!marker || !snippetContainsMarker(cleaned, marker)) {
      rejected += 1;
      reasons.EVIDENCE_SNIPPET_MISMATCH = (reasons.EVIDENCE_SNIPPET_MISMATCH || 0) + 1;
      continue;
    }
    if (!hasStatusPattern(cleaned)) {
      rejected += 1;
      reasons.NO_STATUS_PATTERN = (reasons.NO_STATUS_PATTERN || 0) + 1;
      continue;
    }
    if (hasBannedSnippet(cleaned) || hasBannedSnippet(anchor.anchor || "")) {
      rejected += 1;
      reasons.BANNED_SNIPPET = (reasons.BANNED_SNIPPET || 0) + 1;
      continue;
    }
    const markersInSnippet = CANNABIS_MARKERS.filter((item) =>
      ensureGlobalRegex(item.re)?.test(cleaned)
    ).map((item) => item.label);
    evidence.push({
      type: anchor.type || "html_anchor",
      page: anchor.page || null,
      anchor: anchor.anchor || null,
      quote: cleaned,
      snapshot_path: snapshotPath,
      snapshot_ref: snapshotPath,
      content_hash: contentHash || "",
      marker: hit.label,
      markers_in_snippet: markersInSnippet
    });
  }
  return {
    evidence,
    guard: {
      tried: hits.length,
      rejected,
      reasons
    }
  };
}

function computeConfidence(officialSourceOk, statuses, evidence) {
  const official = officialSourceOk;
  const hasEvidence = evidence.length > 0;
  const hasSignal =
    statuses.statusRecreational !== "unknown" ||
    statuses.statusMedical !== "unknown";
  const hasKeywords = /legal|medical cannabis|medicinal cannabis|decriminal/i.test(
    evidence.length ? evidence[0].anchor || "" : ""
  );
  if (official && hasEvidence && hasSignal && hasKeywords) return "med";
  if (official && hasEvidence && hasSignal) return "med";
  return "low";
}

function main() {
  const iso2 = readArg("--iso2").toUpperCase();
  const snapshotPath = readArg("--snapshot");
  const url = readArg("--url");
  const reportPath = readArg("--out") || DEFAULT_REPORT_PATH;

  if (!iso2 || !snapshotPath || !url) {
    console.error("ERROR: missing required args");
    process.exit(1);
  }

  if (!fs.existsSync(snapshotPath)) {
    writeJson(reportPath, {
      run_at: new Date().toISOString(),
      iso2,
      extracted: 0,
      confidence: "low",
      evidence_count: 0,
      snapshot_path: snapshotPath,
      source_url: url,
      candidate_only: true,
      reason: "SNAPSHOT_MISSING"
    });
    process.exit(0);
  }

  const officialSourceOk = isOfficialUrl(url).ok;
  if (!officialSourceOk) {
    writeJson(reportPath, {
      run_at: new Date().toISOString(),
      iso2,
      extracted: 0,
      confidence: "low",
      evidence_count: 0,
      evidence: [],
      snapshot_path: snapshotPath,
      source_url: url,
      official_source_ok: false,
      candidate_only: true,
      reason: "NOT_OFFICIAL"
    });
    process.exit(0);
  }

  const {
    text,
    anchor,
    snippet,
    text_len,
    text_source,
    ocr_ran,
    ocr_failed,
    has_text_layer,
    extracted_text_len,
    ocr_text_len,
    ocr_text_path,
    ocr_engine,
    ocr_pages,
    ocr_reason,
    ocr_required
  } = readSnapshotText(snapshotPath);
  const ocrText =
    ocr_ran && ocr_text_path && fs.existsSync(ocr_text_path)
      ? fs.readFileSync(ocr_text_path, "utf8")
      : "";
  if (ocr_ran) {
    updateSnapshotMeta(snapshotPath, {
      ocr_text: ocrText,
      ocr_text_len,
      ocr_text_path,
      ocr_engine,
      ocr_pages,
      ocr_ran: true,
      ocr_required,
      extracted_text_len,
      has_text_layer
    });
  }
  const lawLikely = isLawPageLikely(text, url);
  const lawMarker = lawLikely.law_marker;
  const docIsNormative = isDocumentSnapshot(snapshotPath) && isNormativeDoc(text);
  const cannabisMarker = hasCannabisMarker(text);
  const cannabisBindingMarker = hasCannabisBindingMarker(text);
  const markerHits = collectMarkerHits(text);
  const statuses = text
    ? detectStatuses(text)
    : { statusRecreational: "unknown", statusMedical: "unknown" };
  const restrictedNotes = text ? detectRestrictedNotes(text) : null;
  const contentHash = sha256(fs.readFileSync(snapshotPath));
  const evidencePayload = buildEvidenceFromText(
    anchor,
    snapshotPath,
    snippet || text,
    contentHash
  );
  const evidence = Array.isArray(evidencePayload.evidence) ? evidencePayload.evidence : [];
  const evidenceGuard = evidencePayload.guard || { tried: 0, rejected: 0, reasons: {} };
  const statusClaim =
    lawLikely.ok || docIsNormative
      ? extractStatusClaim(text)
      : {
          type: "UNKNOWN",
          scope: [],
          conditions: "",
          jurisdiction_level: "national",
          effective_date: "",
          snippet: "",
          markers_in_snippet: [],
          cannabis_bound: false,
          status_pattern: "",
          reason: "NO_STATUS_CLAIM"
        };
  const statusClaimOk =
    statusClaim?.type &&
    statusClaim.type !== "UNKNOWN" &&
    statusClaim.cannabis_bound &&
    statusClaim.snippet &&
    hasStatusPattern(statusClaim.snippet) &&
    snippetContainsBindingMarker(statusClaim.snippet);
  let evidenceQuote = String(evidence[0]?.quote || "");
  if (statusClaimOk) {
    evidenceQuote = statusClaim.snippet;
    evidence.splice(0, evidence.length, {
      ...evidence[0],
      quote: statusClaim.snippet,
      marker: statusClaim.markers_in_snippet?.[0] || evidence[0]?.marker || "",
      markers_in_snippet: statusClaim.markers_in_snippet || []
    });
  }
  const lawMarkerInQuote = hasLawMarker(evidenceQuote);
  const cannabisMarkerInQuote = hasCannabisBindingMarker(evidenceQuote);
  const evidenceKind =
    lawLikely.ok && lawMarker && cannabisBindingMarker && lawMarkerInQuote && cannabisMarkerInQuote
      ? "law"
      : docIsNormative && cannabisBindingMarker && cannabisMarkerInQuote
        ? "law_doc"
        : "non_law";
  const confidence = computeConfidence(officialSourceOk, statuses, evidence);
  const entryConfidence = "machine_high";
  const generatedAt = new Date().toISOString();
  const ocrRequired = snapshotPath.endsWith(".pdf") && Boolean(ocr_required);
  const ocrFailed = ocrRequired && ocr_failed;
  const ocrEmpty = ocrRequired && ocr_ran && (ocr_text_len || 0) < 1;
  if (ocrFailed) {
    writeJson(reportPath, {
      run_at: generatedAt,
      iso2,
      extracted: 0,
      confidence,
      evidence_count: 0,
      evidence,
      snapshot_path: snapshotPath,
      source_url: url,
      official_source_ok: officialSourceOk,
      candidate_only: true,
      evidence_kind: evidenceKind,
      doc_is_normative: docIsNormative,
      law_page_likely: lawLikely.ok,
      law_page_structure: lawLikely.structure,
      text_len,
      text_source,
      ocr_ran,
      has_text_layer,
      extracted_text_len,
      ocr_text_len,
      ocr_text_path,
      ocr_engine,
      ocr_pages,
      ocr_reason: ocr_reason || "OCR_FAILED",
      ocr_required,
      markers_checked: CANNABIS_MARKERS.length,
      marker_hits: markerHits,
      status_claim: statusClaim,
      reason: ocr_reason || "OCR_FAILED"
    });
    process.exit(0);
  }
  if (ocrEmpty) {
    writeJson(reportPath, {
      run_at: generatedAt,
      iso2,
      extracted: 0,
      confidence,
      evidence_count: 0,
      evidence,
      snapshot_path: snapshotPath,
      source_url: url,
      official_source_ok: officialSourceOk,
      candidate_only: true,
      evidence_kind: evidenceKind,
      doc_is_normative: docIsNormative,
      law_page_likely: lawLikely.ok,
      law_page_structure: lawLikely.structure,
      text_len,
      text_source,
      ocr_ran,
      has_text_layer,
      extracted_text_len,
      ocr_text_len,
      ocr_text_path,
      ocr_engine,
      ocr_pages,
      ocr_reason: "OCR_EMPTY",
      ocr_required,
      markers_checked: CANNABIS_MARKERS.length,
      marker_hits: markerHits,
      status_claim: statusClaim,
      reason: "OCR_EMPTY"
    });
    process.exit(0);
  }
  if (!text_len) {
    writeJson(reportPath, {
      run_at: generatedAt,
      iso2,
      extracted: 0,
      confidence,
      evidence_count: 0,
      evidence,
      snapshot_path: snapshotPath,
      source_url: url,
      official_source_ok: officialSourceOk,
      candidate_only: true,
      evidence_kind: evidenceKind,
      doc_is_normative: docIsNormative,
      law_page_likely: lawLikely.ok,
      law_page_structure: lawLikely.structure,
      text_len,
      text_source,
      ocr_ran,
      has_text_layer,
      extracted_text_len,
      ocr_text_len,
      ocr_text_path,
      ocr_engine,
      ocr_pages,
      ocr_reason,
      ocr_required,
      markers_checked: CANNABIS_MARKERS.length,
      marker_hits: markerHits,
      evidence_snippet_guard: evidenceGuard,
      status_claim: statusClaim,
      reason: "NO_DOC_TEXT"
    });
    process.exit(0);
  }
  if (!anchor) {
    writeJson(reportPath, {
      run_at: generatedAt,
      iso2,
      extracted: 0,
      confidence,
      evidence_count: 0,
      evidence,
      snapshot_path: snapshotPath,
      source_url: url,
      official_source_ok: officialSourceOk,
      candidate_only: true,
      evidence_kind: evidenceKind,
      doc_is_normative: docIsNormative,
      law_page_likely: lawLikely.ok,
      law_page_structure: lawLikely.structure,
      text_len,
      text_source,
      ocr_ran,
      has_text_layer,
      extracted_text_len,
      ocr_text_len,
      ocr_text_path,
      ocr_engine,
      ocr_pages,
      ocr_reason,
      ocr_required,
      markers_checked: CANNABIS_MARKERS.length,
      marker_hits: markerHits,
      evidence_snippet_guard: evidenceGuard,
      status_claim: statusClaim,
      reason: "NO_LOCATOR"
    });
    process.exit(0);
  }
  if (evidence.length === 0) {
    const mismatch = evidenceGuard.rejected > 0 && evidenceGuard.tried > 0;
    const statusPatternMissing = Number(evidenceGuard?.reasons?.NO_STATUS_PATTERN || 0) > 0;
    writeJson(reportPath, {
      run_at: generatedAt,
      iso2,
      extracted: 0,
      confidence,
      evidence_count: 0,
      evidence,
      snapshot_path: snapshotPath,
      source_url: url,
      official_source_ok: officialSourceOk,
      candidate_only: true,
      evidence_kind: evidenceKind,
      doc_is_normative: docIsNormative,
      law_page_likely: lawLikely.ok,
      law_page_structure: lawLikely.structure,
      text_len,
      text_source,
      ocr_ran,
      has_text_layer,
      extracted_text_len,
      ocr_text_len,
      ocr_text_path,
      ocr_engine,
      ocr_pages,
      ocr_reason,
      ocr_required,
      markers_checked: CANNABIS_MARKERS.length,
      marker_hits: markerHits,
      evidence_snippet_guard: evidenceGuard,
      status_claim: statusClaim,
      reason: statusPatternMissing
        ? "NO_STATUS_PATTERN"
        : mismatch
          ? "EVIDENCE_SNIPPET_MISMATCH"
          : "NO_EVIDENCE"
    });
    process.exit(0);
  }
  if (!officialSourceOk) {
    writeJson(reportPath, {
      run_at: generatedAt,
      iso2,
      extracted: 0,
      confidence,
      evidence_count: evidence.length,
      evidence,
      snapshot_path: snapshotPath,
      source_url: url,
      official_source_ok: officialSourceOk,
      candidate_only: true,
      evidence_kind: evidenceKind,
      doc_is_normative: docIsNormative,
      law_page_likely: lawLikely.ok,
      law_page_structure: lawLikely.structure,
      text_len,
      text_source,
      ocr_ran,
      has_text_layer,
      extracted_text_len,
      ocr_text_len,
      ocr_text_path,
      ocr_engine,
      ocr_pages,
      ocr_reason,
      ocr_required,
      markers_checked: CANNABIS_MARKERS.length,
      marker_hits: markerHits,
      evidence_snippet_guard: evidenceGuard,
      status_claim: statusClaim,
      reason: "NOT_OFFICIAL"
    });
    process.exit(0);
  }
  if (!cannabisMarkerInQuote) {
    writeJson(reportPath, {
      run_at: generatedAt,
      iso2,
      extracted: 0,
      confidence,
      evidence_count: evidence.length,
      evidence,
      snapshot_path: snapshotPath,
      source_url: url,
      official_source_ok: officialSourceOk,
      candidate_only: true,
      evidence_kind: evidenceKind,
      doc_is_normative: docIsNormative,
      law_marker_found: lawMarkerInQuote,
      cannabis_marker_found: cannabisMarkerInQuote,
      cannabis_binding_found: cannabisMarkerInQuote,
      law_page_likely: lawLikely.ok,
      law_page_structure: lawLikely.structure,
      text_len,
      text_source,
      ocr_ran,
      has_text_layer,
      extracted_text_len,
      ocr_text_len,
      ocr_text_path,
      ocr_engine,
      ocr_pages,
      ocr_reason,
      ocr_required,
      markers_checked: CANNABIS_MARKERS.length,
      marker_hits: markerHits,
      evidence_snippet_guard: evidenceGuard,
      status_claim: statusClaim,
      reason: "NO_MARKER_IN_DOC"
    });
    process.exit(0);
  }
  if (!statusClaimOk) {
    const statusReason = statusClaim?.reason || "NO_STATUS_CLAIM";
    writeJson(reportPath, {
      run_at: generatedAt,
      iso2,
      extracted: 0,
      confidence,
      evidence_count: evidence.length,
      evidence,
      snapshot_path: snapshotPath,
      source_url: url,
      official_source_ok: officialSourceOk,
      candidate_only: true,
      evidence_kind: evidenceKind,
      doc_is_normative: docIsNormative,
      law_marker_found: lawMarkerInQuote,
      cannabis_marker_found: cannabisMarkerInQuote,
      cannabis_binding_found: cannabisMarkerInQuote,
      law_page_likely: lawLikely.ok,
      law_page_structure: lawLikely.structure,
      text_len,
      text_source,
      ocr_ran,
      has_text_layer,
      extracted_text_len,
      ocr_text_len,
      ocr_text_path,
      ocr_engine,
      ocr_pages,
      ocr_reason,
      ocr_required,
      markers_checked: CANNABIS_MARKERS.length,
      marker_hits: markerHits,
      evidence_snippet_guard: evidenceGuard,
      status_claim: statusClaim,
      reason: statusReason
    });
    process.exit(0);
  }
  if (evidenceKind !== "law" && !(evidenceKind === "law_doc" && docIsNormative)) {
    writeJson(reportPath, {
      run_at: generatedAt,
      iso2,
      extracted: 0,
      confidence,
      evidence_count: evidence.length,
      evidence,
      snapshot_path: snapshotPath,
      source_url: url,
      official_source_ok: officialSourceOk,
      candidate_only: true,
      evidence_kind: evidenceKind,
      doc_is_normative: docIsNormative,
      law_marker_found: lawMarkerInQuote,
      cannabis_marker_found: cannabisMarkerInQuote,
      cannabis_binding_found: cannabisMarkerInQuote,
      law_page_likely: lawLikely.ok,
      law_page_structure: lawLikely.structure,
      text_len,
      text_source,
      ocr_ran,
      has_text_layer,
      extracted_text_len,
      ocr_text_len,
      ocr_text_path,
      ocr_engine,
      ocr_pages,
      ocr_reason,
      ocr_required,
      markers_checked: CANNABIS_MARKERS.length,
      marker_hits: markerHits,
      evidence_snippet_guard: evidenceGuard,
      status_claim: statusClaim,
      reason: "NOT_NORMATIVE_DOC"
    });
    process.exit(0);
  }

  const entry = {
    iso: iso2,
    iso2,
    status_recreational: statuses.statusRecreational,
    status_medical: statuses.statusMedical,
    medical_allowed: statuses.statusMedical === "legal",
    restricted_notes: restrictedNotes,
    evidence,
    evidence_kind: evidenceKind,
    status_claim: statusClaim,
    retrieved_at: generatedAt,
    generated_at: generatedAt,
    confidence: entryConfidence,
    official_source_ok: officialSourceOk,
    source_url: url,
    snapshot_path: snapshotPath,
    snapshot_ref: snapshotPath,
    content_hash: contentHash,
    model_id: MODEL_ID
  };

  writeMachineVerifiedEntries({
    entries: { [iso2]: entry },
    outputPath: OUTPUT_PATH,
    runId: process.env.RUN_ID || "",
    reason: "AUTO_FACTS_UPSERT"
  });

  writeJson(reportPath, {
    run_at: generatedAt,
    iso2,
    extracted: 1,
    confidence,
    evidence_count: evidence.length,
    evidence,
    snapshot_path: snapshotPath,
    source_url: url,
    content_hash: contentHash,
    status_recreational: statuses.statusRecreational,
    status_medical: statuses.statusMedical,
    official_source_ok: officialSourceOk,
    evidence_kind: evidenceKind,
    doc_is_normative: docIsNormative,
    law_marker_found: lawMarkerInQuote,
    cannabis_marker_found: cannabisMarkerInQuote,
    cannabis_binding_found: cannabisMarkerInQuote,
    law_page_likely: lawLikely.ok,
    law_page_structure: lawLikely.structure,
    text_len,
    text_source,
    ocr_ran,
    has_text_layer,
    extracted_text_len,
    ocr_text_len,
    ocr_text_path,
    ocr_engine,
    ocr_pages,
    ocr_reason,
    ocr_required,
    markers_checked: CANNABIS_MARKERS.length,
    marker_hits: markerHits,
    evidence_snippet_guard: evidenceGuard,
    status_claim: statusClaim,
    reason: "OK"
    });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { CANNABIS_MARKERS };
