#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const DEFAULT_LEDGER_PATH = path.join(
  ROOT,
  "data",
  "official",
  "cannabis_law_visual_reviews.audit.json",
);
const DEFAULT_MATRIX_PATH = path.join(
  ROOT,
  "data",
  "reviews",
  "wiki-truth-cannabis-law-matrix-307.json",
);
const DEFAULT_TERM_INVENTORY_PATH = path.join(
  ROOT,
  "data",
  "cannabis_profiles",
  "query-derived-cannabis-terms.v1.json",
);

export const REVALIDATION_STATES = Object.freeze([
  "NOT_MODIFIED",
  "CONTENT_CHANGED",
  "REDIRECT_OR_OWNER_CHANGED",
  "EFFECTIVE_DATE_REVIEW_DUE",
  "ACCESS_BLOCKED",
  "NEEDS_SEMANTIC_REVIEW",
  "NEEDS_VISUAL_REVIEW",
]);

const REVALIDATION_STATE_SET = new Set(REVALIDATION_STATES);
const SOURCE_COLLECTION_NAMES = new Set([
  "verified_sources",
  "official_source_annotations",
  "verified_context_sources",
  "discovered_official_sources",
  "official_sources",
  "primary_laws",
  "operational_sources",
  "current_official_sources",
  "official_context_sources",
  "official_link_annotations",
  "independent_sources",
  "context_sources",
  "source_annotations",
  "sources",
]);
const EXCLUDED_SOURCE_PATH = /(?:^|\.)(?:source_access_states|source_access_attempts|source_reopen_attempts|official_source_access_log|current_source_reopen_attempts|attempted_official_sources|research_notes|fresh_official_search|visual_evidence|historical_visual_context|retained_context_sources|excluded_context_sources|supporting_nonofficial_reproductions)(?:\.|$)/i;
const BLOCKED_HTTP_STATUSES = new Set([401, 403, 407, 408, 423, 429, 451, 502, 503, 504]);
const WAF_OR_BLANK_RE = /cloudflare|captcha|access denied|request blocked|checking your browser|enable javascript and cookies|web application firewall|forbidden|blank viewer/i;
const LEGAL_MUTATION_KEYS = new Set([
  "independent_truth_color",
  "independentTruthColor",
  "independent_truth_status",
  "independentTruthStatus",
  "official_status",
  "officialStatus",
  "legal_axes",
  "legalAxes",
  "truth",
  "truth_color",
  "official_truth_color",
  "color",
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function clone(value) {
  return structuredClone(value);
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function arrayValue(value) {
  if (Array.isArray(value)) return value.map(stringValue).filter(Boolean);
  const scalar = stringValue(value);
  return scalar ? [scalar] : [];
}

function sourceOwner(source) {
  return stringValue(
    source?.source_owner_geo ?? source?.sourceOwnerGeo ?? source?.source_owner_scope,
  );
}

function sourceAppliesTo(source) {
  return Array.from(new Set([
    ...arrayValue(source?.applies_to_geo),
    ...arrayValue(source?.applies_to_geos),
    ...arrayValue(source?.appliesToGeo),
    ...arrayValue(source?.appliesToGeos),
  ])).sort();
}

function sourceLocator(source) {
  const values = [
    source?.official_fragment_locator,
    source?.direct_locator,
    source?.locator,
    source?.legal_text_location,
    source?.provision,
    source?.exact_section,
  ];
  if (Array.isArray(source?.exact_sections)) values.push(source.exact_sections.join(" | "));
  return values.map(stringValue).find(Boolean) || "";
}

function sourceExactFragment(source) {
  return [
    source?.exact_fragment,
    source?.direct_fragment,
    source?.provision,
  ].map(stringValue).find(Boolean) || "";
}

function hasScreenshotState(source) {
  return [
    source?.screenshot_state,
    source?.visual_state,
    source?.visual_review_result,
    source?.visualReview,
    source?.screenshot_path,
    source?.screenshot,
    source?.screenshot_valid,
    source?.screenshot_available,
    source?.visual_opened,
    source?.official_domain_visible,
    source?.reviewed_by_human_visual,
  ].some((value) => value !== undefined && value !== null && value !== "");
}

function isCurrentSource(source) {
  if (source?.current === false || source?.effective === false) return false;
  const state = [
    source?.current_state,
    source?.current_validity,
    source?.effective_state,
    source?.current_effective_state,
  ].map(stringValue).join(" ").toUpperCase();
  return !/(?:REPEALED|INACTIVE|EXPIRED|SUPERSEDED|HISTORICAL_ONLY|DRAFT_ONLY)/.test(state);
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function canonicalUrl(value) {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    if (parsed.pathname !== "/") parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(?:utm_|fbclid$|gclid$)/i.test(key)) parsed.searchParams.delete(key);
    }
    parsed.searchParams.sort();
    return parsed.toString();
  } catch {
    return stringValue(value);
  }
}

function normalizedHost(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isOfficialSourceRecord(source, collectionPath) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return false;
  if (!isHttpUrl(source.url)) return false;
  if (!isCurrentSource(source)) return false;
  if (EXCLUDED_SOURCE_PATH.test(collectionPath)) return false;
  const collectionName = collectionPath.split(".").at(-1);
  if (!SOURCE_COLLECTION_NAMES.has(collectionName)) return false;
  return Boolean(
    sourceOwner(source) ||
      stringValue(source.source_authority) ||
      stringValue(source.sourceAuthority) ||
      source.official_host_verified === true ||
      /official|primary|law|regulat|gazette|ministry|court|parliament/i.test(
        `${source.source_type || ""} ${source.source_kind || ""} ${source.primary_or_context || ""}`,
      ),
  );
}

function visitSourceCollections(value, visit, parentPath = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "revalidation") continue;
    const childPath = parentPath ? `${parentPath}.${key}` : key;
    if (Array.isArray(child) && SOURCE_COLLECTION_NAMES.has(key) && !EXCLUDED_SOURCE_PATH.test(childPath)) {
      child.forEach((source, index) => {
        if (isOfficialSourceRecord(source, childPath)) visit(source, `${childPath}[${index}]`);
      });
    }
    if (child && typeof child === "object" && !Array.isArray(child)) {
      visitSourceCollections(child, visit, childPath);
    }
  }
}

function rowTruthColor(row) {
  return stringValue(
    row?.independent_truth_color ??
      row?.independentTruthColor ??
      row?.independent_review?.independent_truth_color ??
      row?.independent_review?.official_truth_color ??
      row?.independent_truth_reaudit?.truth_color,
  ).toUpperCase();
}

function isMismatchRow(row) {
  return /MISMATCH|WRONG|OUTDATED|CONFLICT|DIFFERS/i.test(
    `${row?.project_comparison?.status || ""} ${row?.difference_status || ""} ${row?.independent_review?.project_layer?.comparison || ""}`,
  );
}

function isDisputedOrComposite(row) {
  return row?.independent_review?.disputed_or_composite === true ||
    /DISPUTED|COMPOSITE|CLAIMANT/i.test(
      `${row?.independent_truth_status || ""} ${row?.independent_review?.applicability_reason || ""}`,
    );
}

export function collectOfficialSourceRecords(ledger, { geos = null } = {}) {
  const rows = Array.isArray(ledger) ? ledger : ledger?.rows;
  assert(Array.isArray(rows), "official evidence ledger must contain rows");
  const selected = geos ? new Set([...geos].map((geo) => String(geo).toUpperCase())) : null;
  const records = [];
  for (const row of rows) {
    const rowGeo = stringValue(row?.geo).toUpperCase();
    if (!rowGeo || (selected && !selected.has(rowGeo))) continue;
    visitSourceCollections(row, (source, sourcePath) => {
      const owner = sourceOwner(source);
      const url = canonicalUrl(source.url);
      const locator = sourceLocator(source);
      const appliesTo = sourceAppliesTo(source);
      const dependentGeos = Array.from(new Set([rowGeo, ...appliesTo])).sort();
      records.push({
        row,
        rowGeo,
        source,
        sourcePath,
        owner,
        url,
        locator,
        exactFragment: sourceExactFragment(source),
        appliesTo,
        dependentGeos,
        dedupeKey: `${owner || "UNCONFIRMED"}|${url}|${locator || "UNLOCATED"}`,
        criticalColor: ["GREEN", "RED"].includes(rowTruthColor(row)),
        mismatch: isMismatchRow(row),
        disputedOrComposite: isDisputedOrComposite(row),
      });
    });
  }
  return records.sort((a, b) =>
    a.rowGeo.localeCompare(b.rowGeo) ||
    a.url.localeCompare(b.url) ||
    a.locator.localeCompare(b.locator) ||
    a.sourcePath.localeCompare(b.sourcePath),
  );
}

function schemaIssuesFor(record) {
  const issues = [];
  if (!record.owner) issues.push("OWNER_MISSING");
  if (!record.appliesTo.length) issues.push("APPLICABILITY_MISSING");
  if (!record.locator) issues.push("LOCATOR_MISSING");
  if (!record.exactFragment) issues.push("EXACT_FRAGMENT_MISSING");
  if (!hasScreenshotState(record.source)) issues.push("SCREENSHOT_STATE_MISSING");
  return issues;
}

function effectiveDateDue(record, checkedAt) {
  const source = record.source;
  const candidates = [
    source?.effective_date,
    source?.commencement_date,
    source?.repeal_date,
    source?.sunset_date,
  ].map(stringValue).filter(Boolean);
  if (!candidates.length) return false;
  const now = Date.parse(checkedAt);
  const previous = Date.parse(source?.revalidation?.checked_at || "");
  return candidates.some((candidate) => {
    const due = Date.parse(candidate);
    return Number.isFinite(due) && due <= now && (!Number.isFinite(previous) || previous < due);
  });
}

function deriveQueue(record, state, issues) {
  const reasons = [];
  const queue = new Set();
  if ([
    "CONTENT_CHANGED",
    "REDIRECT_OR_OWNER_CHANGED",
    "EFFECTIVE_DATE_REVIEW_DUE",
    "ACCESS_BLOCKED",
    "NEEDS_SEMANTIC_REVIEW",
  ].includes(state)) {
    queue.add("C2");
    reasons.push(state);
  }
  if (record.criticalColor || record.disputedOrComposite || record.mismatch) {
    queue.add("C2");
    reasons.push(
      record.criticalColor
        ? "GREEN_OR_RED_CRITICAL_SOURCE"
        : record.disputedOrComposite
          ? "DISPUTED_OR_COMPOSITE_GEO"
          : "CURRENT_LAYER_MISMATCH",
    );
  }
  const sourceRole = `${record.source.source_type || ""} ${record.source.source_kind || ""} ${record.source.evidence_role || ""} ${record.source.primary_or_context || ""}`;
  if ([
    "CONTENT_CHANGED",
    "NEEDS_SEMANTIC_REVIEW",
    "NEEDS_VISUAL_REVIEW",
    "ACCESS_BLOCKED",
  ].includes(state) || record.criticalColor || /MAP|POPUP|SEO|STRICT_VISUAL/i.test(sourceRole)) {
    queue.add("C3");
  }
  if (issues.includes("SCREENSHOT_STATE_MISSING")) queue.add("C3");
  return {
    queue: [...queue].sort(),
    queueReasons: Array.from(new Set(reasons)).sort(),
  };
}

function baseRevalidation(record, checkedAt) {
  const previous = record.source.revalidation && typeof record.source.revalidation === "object"
    ? record.source.revalidation
    : {};
  const issues = schemaIssuesFor(record);
  const semanticIssues = issues.filter((issue) => issue !== "SCREENSHOT_STATE_MISSING");
  let state = REVALIDATION_STATE_SET.has(previous.revalidation_state)
    ? previous.revalidation_state
    : semanticIssues.length
      ? "NEEDS_SEMANTIC_REVIEW"
      : issues.length
        ? "NEEDS_VISUAL_REVIEW"
        : "NEEDS_SEMANTIC_REVIEW";
  let reason = previous.change_reason ||
    (issues.length ? `C0_SCHEMA:${issues.join(",")}` : "BASELINE_HASH_NOT_ESTABLISHED");
  if (effectiveDateDue(record, checkedAt)) {
    state = "EFFECTIVE_DATE_REVIEW_DUE";
    reason = "EFFECTIVE_OR_LIFECYCLE_DATE_REACHED";
  }
  const queue = deriveQueue(record, state, issues);
  return {
    checked_at: previous.checked_at || checkedAt,
    final_url: previous.final_url || record.url,
    http_status: previous.http_status ?? null,
    etag: previous.etag ?? null,
    last_modified: previous.last_modified ?? null,
    content_type: previous.content_type ?? null,
    content_length: previous.content_length ?? null,
    document_sha256: previous.document_sha256 ?? null,
    relevant_fragment_sha256:
      previous.relevant_fragment_sha256 ??
      (record.exactFragment ? sha256(normalizeText(record.exactFragment)) : null),
    revalidation_state: state,
    access_state: previous.access_state || "NOT_CHECKED_LOCAL_ONLY",
    change_reason: reason,
    queue: queue.queue,
    queue_reasons: queue.queueReasons,
    dependent_geos: record.dependentGeos,
    schema_issues: issues,
    semantic_probe: previous.semantic_probe ?? null,
  };
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlToText(value) {
  return normalizeText(
    String(value || "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">"),
  );
}

function fragmentHashFromText(text, exactFragment) {
  const normalizedDocument = normalizeText(text).toLocaleLowerCase();
  const normalizedFragment = normalizeText(exactFragment);
  if (!normalizedFragment) return null;
  if (!normalizedDocument.includes(normalizedFragment.toLocaleLowerCase())) return null;
  return sha256(normalizedFragment);
}

function defaultCommandRunner(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: options.encoding ?? "utf8",
    maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
    ...options,
  });
}

function loadQueryTerms(inventoryPath = DEFAULT_TERM_INVENTORY_PATH) {
  const payload = readJson(inventoryPath);
  const terms = (Array.isArray(payload?.terms) ? payload.terms : [])
    .flatMap((entry) => [entry?.term, entry?.canonicalConcept])
    .map((term) => normalizeText(term).toLocaleLowerCase())
    .filter((term) => term.length >= 3);
  return Array.from(new Set(["cannabis", "marijuana", "marihuana", "hashish", "hemp", ...terms]));
}

function relevantPdfPages(text, terms) {
  return String(text || "")
    .split("\f")
    .map((pageText, index) => ({ page: index + 1, text: normalizeText(pageText).toLocaleLowerCase() }))
    .filter(({ text }) => text && terms.some((term) => text.includes(term)))
    .map(({ page }) => page);
}

export function inspectPdf({
  buffer,
  terms = ["cannabis", "marijuana", "marihuana", "hashish", "hemp"],
  commandRunner = defaultCommandRunner,
  ocrScript = path.join(ROOT, "tools", "ocr", "ocr_pdf.sh"),
}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-revalidate-pdf-"));
  const pdfPath = path.join(tempDir, "document.pdf");
  const ocrTextPath = path.join(tempDir, "ocr.txt");
  fs.writeFileSync(pdfPath, buffer);
  try {
    const textResult = commandRunner("pdftotext", ["-layout", "-q", pdfPath, "-"]);
    let text = textResult?.status === 0 ? String(textResult.stdout || "") : "";
    const textLayerLength = normalizeText(text).length;
    let ocrUsed = false;
    if (textLayerLength < 80) {
      const ocrResult = commandRunner(ocrScript, [pdfPath, ocrTextPath]);
      ocrUsed = true;
      if (ocrResult?.status === 0 && fs.existsSync(ocrTextPath)) {
        text = fs.readFileSync(ocrTextPath, "utf8");
      }
    }
    const pages = relevantPdfPages(text, terms);
    const renderedPages = [];
    for (const page of pages) {
      const prefix = path.join(tempDir, `page-${page}`);
      const renderResult = commandRunner("pdftoppm", [
        "-f",
        String(page),
        "-l",
        String(page),
        "-singlefile",
        "-png",
        pdfPath,
        prefix,
      ]);
      if (renderResult?.status === 0) renderedPages.push(page);
    }
    return {
      extractor: textLayerLength >= 80 ? "pdftotext" : ocrUsed ? "ocr" : "none",
      text_layer_length: textLayerLength,
      ocr_used: ocrUsed,
      relevant_pages: pages,
      rendered_pages: renderedPages,
      extracted_text: text,
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function contentMetadata(response, bytes) {
  return {
    etag: response.headers.get("etag"),
    last_modified: response.headers.get("last-modified"),
    content_type: response.headers.get("content-type"),
    content_length: Number(response.headers.get("content-length")) || bytes?.byteLength || null,
  };
}

async function conditionalFetch(url, previous, { fetchImpl, timeoutMs }) {
  const headers = { Accept: "text/html,application/xhtml+xml,application/pdf,*/*;q=0.8" };
  if (previous?.etag) headers["If-None-Match"] = previous.etag;
  if (previous?.last_modified) headers["If-Modified-Since"] = previous.last_modified;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("REVALIDATION_TIMEOUT")), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers,
      redirect: "follow",
      signal: controller.signal,
    });
    if (response.status === 304) return { response, bytes: null };
    const bytes = Buffer.from(await response.arrayBuffer());
    return { response, bytes };
  } finally {
    clearTimeout(timeout);
  }
}

function accessStateForError(error) {
  const text = `${error?.name || ""} ${error?.message || ""}`;
  if (/abort|timeout/i.test(text)) return "TIMEOUT";
  return "NETWORK_ERROR";
}

function recordsByFetchUrl(records) {
  const groups = new Map();
  for (const record of records) {
    const group = groups.get(record.url) || [];
    group.push(record);
    groups.set(record.url, group);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function selectRecordsForGeos(records, geos) {
  if (!geos) return records;
  const selected = new Set([...geos].map((geo) => String(geo).toUpperCase()));
  const sharedUrls = new Set(records
    .filter((record) =>
      selected.has(record.rowGeo) ||
      record.dependentGeos.some((geo) => selected.has(geo)),
    )
    .map((record) => record.url));
  return records.filter((record) => sharedUrls.has(record.url));
}

function applyNetworkResult(record, result, checkedAt, terms, pdfTools) {
  const previous = baseRevalidation(record, checkedAt);
  const { response, bytes } = result;
  const metadata = contentMetadata(response, bytes);
  const finalUrl = canonicalUrl(response.url || record.url);
  const redirectedOwner = normalizedHost(finalUrl) !== normalizedHost(record.url);
  let state = previous.revalidation_state;
  let accessState = "HTTP_OK";
  let reason = "";
  let documentHash = previous.document_sha256;
  let relevantHash = previous.relevant_fragment_sha256;
  let semanticProbe = previous.semantic_probe;

  if (response.status === 304) {
    state = "NOT_MODIFIED";
    reason = "HTTP_304_CONDITIONAL_GET";
  } else if (BLOCKED_HTTP_STATUSES.has(response.status)) {
    state = "ACCESS_BLOCKED";
    accessState = `HTTP_STATUS_${response.status}`;
    reason = `HTTP_STATUS_${response.status}_IS_ACCESS_STATE_ONLY`;
  } else if (!response.ok) {
    state = "ACCESS_BLOCKED";
    accessState = `HTTP_STATUS_${response.status}`;
    reason = `HTTP_STATUS_${response.status}_IS_NOT_LEGAL_EVIDENCE`;
  } else {
    documentHash = sha256(bytes);
    const contentType = String(metadata.content_type || "").toLowerCase();
    const bodyText = contentType.includes("pdf")
      ? ""
      : htmlToText(bytes.toString("utf8"));
    if (!contentType.includes("pdf") && (!bodyText || WAF_OR_BLANK_RE.test(bodyText.slice(0, 2000)))) {
      state = "ACCESS_BLOCKED";
      accessState = WAF_OR_BLANK_RE.test(bodyText.slice(0, 2000)) ? "WAF_OR_CHALLENGE" : "BLANK_VIEWER";
      reason = `${accessState}_IS_ACCESS_STATE_ONLY`;
    } else if (redirectedOwner || response.redirected) {
      state = "REDIRECT_OR_OWNER_CHANGED";
      reason = `FINAL_URL_CHANGED:${record.url}->${finalUrl}`;
    } else if (previous.document_sha256 && previous.document_sha256 === documentHash) {
      const etagChanged = previous.etag && metadata.etag && previous.etag !== metadata.etag;
      const lastModifiedChanged = previous.last_modified && metadata.last_modified &&
        previous.last_modified !== metadata.last_modified;
      if (etagChanged || lastModifiedChanged) {
        state = "CONTENT_CHANGED";
        reason = etagChanged
          ? "ETAG_CHANGED_DOCUMENT_SHA256_UNCHANGED_REVIEW_DUE"
          : "LAST_MODIFIED_CHANGED_DOCUMENT_SHA256_UNCHANGED_REVIEW_DUE";
      } else {
        state = "NOT_MODIFIED";
        reason = "HTTP_200_DOCUMENT_SHA256_UNCHANGED";
      }
    } else if (previous.document_sha256 && previous.document_sha256 !== documentHash) {
      state = "CONTENT_CHANGED";
      reason = "DOCUMENT_SHA256_CHANGED";
    } else {
      state = "NEEDS_SEMANTIC_REVIEW";
      reason = "NETWORK_BASELINE_ESTABLISHED_REVIEW_REQUIRED";
    }

    const semanticProbeRequired = [
      "CONTENT_CHANGED",
      "REDIRECT_OR_OWNER_CHANGED",
      "NEEDS_SEMANTIC_REVIEW",
      "EFFECTIVE_DATE_REVIEW_DUE",
    ].includes(state);
    if (state !== "ACCESS_BLOCKED" && contentType.includes("pdf") && bytes && semanticProbeRequired) {
      semanticProbe = pdfTools.inspect({ buffer: bytes, terms });
      const extractedHash = fragmentHashFromText(semanticProbe.extracted_text, record.exactFragment);
      if (extractedHash) relevantHash = extractedHash;
    } else if (state !== "ACCESS_BLOCKED" && bodyText) {
      const extractedHash = fragmentHashFromText(bodyText, record.exactFragment);
      if (extractedHash) relevantHash = extractedHash;
    }
    if (
      previous.relevant_fragment_sha256 &&
      relevantHash &&
      previous.relevant_fragment_sha256 !== relevantHash
    ) {
      state = "CONTENT_CHANGED";
      reason = "RELEVANT_FRAGMENT_SHA256_CHANGED";
    }
  }

  if (effectiveDateDue(record, checkedAt)) {
    state = "EFFECTIVE_DATE_REVIEW_DUE";
    reason = "EFFECTIVE_OR_LIFECYCLE_DATE_REACHED";
  }
  const issues = schemaIssuesFor(record);
  const queue = deriveQueue(record, state, issues);
  record.source.revalidation = {
    checked_at: checkedAt,
    final_url: finalUrl,
    http_status: response.status,
    etag: metadata.etag ?? previous.etag,
    last_modified: metadata.last_modified ?? previous.last_modified,
    content_type: metadata.content_type ?? previous.content_type,
    content_length: metadata.content_length ?? previous.content_length,
    document_sha256: documentHash,
    relevant_fragment_sha256: relevantHash,
    revalidation_state: state,
    access_state: accessState,
    change_reason: reason,
    queue: queue.queue,
    queue_reasons: queue.queueReasons,
    dependent_geos: record.dependentGeos,
    schema_issues: issues,
    semantic_probe: semanticProbe
      ? {
          extractor: semanticProbe.extractor,
          text_layer_length: semanticProbe.text_layer_length,
          ocr_used: semanticProbe.ocr_used,
          relevant_pages: semanticProbe.relevant_pages,
          rendered_pages: semanticProbe.rendered_pages,
        }
      : null,
  };
}

function applyNetworkError(record, error, checkedAt) {
  const previous = baseRevalidation(record, checkedAt);
  const accessState = accessStateForError(error);
  const issues = schemaIssuesFor(record);
  const queue = deriveQueue(record, "ACCESS_BLOCKED", issues);
  record.source.revalidation = {
    ...previous,
    checked_at: checkedAt,
    revalidation_state: "ACCESS_BLOCKED",
    access_state: accessState,
    change_reason: `${accessState}_IS_ACCESS_STATE_ONLY`,
    queue: queue.queue,
    queue_reasons: queue.queueReasons,
    schema_issues: issues,
  };
}

function stripRevalidation(value) {
  if (Array.isArray(value)) return value.map(stripRevalidation);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "revalidation")
      .map(([key, child]) => [key, stripRevalidation(child)]),
  );
}

function legalBoundaryDigest(value) {
  const selected = [];
  function visit(node, nodePath = "") {
    if (Array.isArray(node)) {
      node.forEach((entry, index) => visit(entry, `${nodePath}[${index}]`));
      return;
    }
    if (!node || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node)) {
      const childPath = nodePath ? `${nodePath}.${key}` : key;
      if (LEGAL_MUTATION_KEYS.has(key)) selected.push([childPath, child]);
      if (key !== "revalidation") visit(child, childPath);
    }
  }
  visit(value);
  return sha256(JSON.stringify(selected));
}

export async function runRevalidation({
  ledger,
  geos = null,
  network = false,
  checkedAt = new Date().toISOString(),
  batchSize = 25,
  fetchImpl = globalThis.fetch,
  timeoutMs = 20_000,
  terms = null,
  pdfTools = null,
} = {}) {
  assert(ledger && typeof ledger === "object", "ledger is required");
  assert(Number.isInteger(batchSize) && batchSize > 0, "batchSize must be a positive integer");
  if (network) assert.equal(typeof fetchImpl, "function", "fetch implementation is required for --network");
  const beforeWithoutRevalidation = stripRevalidation(ledger);
  const beforeLegalDigest = legalBoundaryDigest(ledger);
  const records = selectRecordsForGeos(collectOfficialSourceRecords(ledger), geos);
  const sourceIdentityBefore = records.map((record) => `${record.rowGeo}|${record.sourcePath}|${record.dedupeKey}`);

  for (const record of records) {
    record.source.revalidation = baseRevalidation(record, checkedAt);
  }

  const fetchedUrls = [];
  if (network) {
    const groups = recordsByFetchUrl(records);
    const effectiveTerms = terms || loadQueryTerms();
    const effectivePdfTools = pdfTools || {
      inspect: ({ buffer, terms: pdfTerms }) => inspectPdf({ buffer, terms: pdfTerms }),
    };
    for (let offset = 0; offset < groups.length; offset += batchSize) {
      const batch = groups.slice(offset, offset + batchSize);
      for (const [url, urlRecords] of batch) {
        fetchedUrls.push(url);
        try {
          const validatorRecord = urlRecords.find((record) =>
            record.source.revalidation.etag || record.source.revalidation.last_modified,
          ) || urlRecords[0];
          const result = await conditionalFetch(url, validatorRecord.source.revalidation, {
            fetchImpl,
            timeoutMs,
          });
          for (const record of urlRecords) {
            applyNetworkResult(record, result, checkedAt, effectiveTerms, effectivePdfTools);
          }
        } catch (error) {
          for (const record of urlRecords) applyNetworkError(record, error, checkedAt);
        }
      }
    }
  }

  assert.deepEqual(
    stripRevalidation(ledger),
    beforeWithoutRevalidation,
    "REVALIDATION_MUTATED_NON_REVALIDATION_DATA",
  );
  assert.equal(
    legalBoundaryDigest(ledger),
    beforeLegalDigest,
    "REVALIDATION_MUTATED_LEGAL_OR_COLOR_BOUNDARY",
  );
  const afterRecords = selectRecordsForGeos(collectOfficialSourceRecords(ledger), geos);
  const sourceIdentityAfter = afterRecords.map((record) => `${record.rowGeo}|${record.sourcePath}|${record.dedupeKey}`);
  assert.deepEqual(sourceIdentityAfter, sourceIdentityBefore, "REVALIDATION_SOURCE_SHRINK_OR_REORDER");

  const stateCounts = Object.fromEntries(REVALIDATION_STATES.map((state) => [state, 0]));
  for (const record of afterRecords) {
    stateCounts[record.source.revalidation.revalidation_state] += 1;
  }
  return {
    ledger,
    records: afterRecords,
    sourceCount: afterRecords.length,
    uniqueEvidenceCount: new Set(afterRecords.map((record) => record.dedupeKey)).size,
    uniqueFetchUrlCount: new Set(afterRecords.map((record) => record.url)).size,
    fetchedUrls,
    stateCounts,
    c2QueueGeos: Array.from(new Set(afterRecords
      .filter((record) => record.source.revalidation.queue.includes("C2"))
      .flatMap((record) => record.source.revalidation.dependent_geos))).sort(),
    c3QueueGeos: Array.from(new Set(afterRecords
      .filter((record) => record.source.revalidation.queue.includes("C3"))
      .flatMap((record) => record.source.revalidation.dependent_geos))).sort(),
  };
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    all: false,
    geos: [],
    network: false,
    explicitDryRun: false,
    applyLocal: false,
    batchSize: 25,
    ledgerPath: DEFAULT_LEDGER_PATH,
    matrixPath: DEFAULT_MATRIX_PATH,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--all") options.all = true;
    else if (arg === "--network") options.network = true;
    else if (arg === "--dry-run") options.explicitDryRun = true;
    else if (arg === "--apply-local") options.applyLocal = true;
    else if (arg === "--geo") options.geos.push(...String(args[++index] || "").split(","));
    else if (arg.startsWith("--geo=")) options.geos.push(...arg.slice(6).split(","));
    else if (arg === "--batch-size") options.batchSize = Number(args[++index]);
    else if (arg.startsWith("--batch-size=")) options.batchSize = Number(arg.slice(13));
    else if (arg === "--ledger") options.ledgerPath = path.resolve(args[++index]);
    else if (arg === "--matrix") options.matrixPath = path.resolve(args[++index]);
    else throw new Error(`UNKNOWN_ARGUMENT ${arg}`);
  }
  options.geos = Array.from(new Set(options.geos.map((geo) => geo.trim().toUpperCase()).filter(Boolean))).sort();
  if (options.all && options.geos.length) throw new Error("USE_EITHER_ALL_OR_GEO");
  if (options.network && options.explicitDryRun) throw new Error("NETWORK_AND_DRY_RUN_ARE_MUTUALLY_EXCLUSIVE");
  if (options.applyLocal && options.network) throw new Error("APPLY_LOCAL_AND_NETWORK_ARE_MUTUALLY_EXCLUSIVE");
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1) throw new Error("INVALID_BATCH_SIZE");
  options.dryRun = options.explicitDryRun || (!options.network && !options.applyLocal);
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const ledger = readJson(options.ledgerPath);
  const matrixBefore = fs.existsSync(options.matrixPath)
    ? sha256(fs.readFileSync(options.matrixPath))
    : null;
  const ledgerBefore = sha256(fs.readFileSync(options.ledgerPath));
  const geos = options.all || !options.geos.length ? null : new Set(options.geos);
  const result = await runRevalidation({
    ledger,
    geos,
    network: options.network,
    batchSize: options.batchSize,
  });
  if (!options.dryRun) writeJson(options.ledgerPath, result.ledger);
  const ledgerAfter = sha256(fs.readFileSync(options.ledgerPath));
  const matrixAfter = fs.existsSync(options.matrixPath)
    ? sha256(fs.readFileSync(options.matrixPath))
    : null;
  if (options.dryRun) {
    assert.equal(ledgerAfter, ledgerBefore, "DRY_RUN_LEDGER_MUTATION");
    assert.equal(matrixAfter, matrixBefore, "DRY_RUN_MATRIX_MUTATION");
  }
  console.log(`REVALIDATION_MODE=${options.network ? "C1_NETWORK" : "C0_LOCAL"}`);
  console.log(`DRY_RUN=${options.dryRun ? 1 : 0}`);
  console.log(`SOURCE_RECORDS=${result.sourceCount}`);
  console.log(`UNIQUE_EVIDENCE=${result.uniqueEvidenceCount}`);
  console.log(`UNIQUE_FETCH_URLS=${result.uniqueFetchUrlCount}`);
  console.log(`FETCHED_URLS=${result.fetchedUrls.length}`);
  console.log(`STATE_COUNTS=${JSON.stringify(result.stateCounts)}`);
  console.log(`C2_QUEUE_GEO_COUNT=${result.c2QueueGeos.length}`);
  console.log(`C3_QUEUE_GEO_COUNT=${result.c3QueueGeos.length}`);
  const summarizeQueue = (values) => values.length <= 25
    ? values.join(",")
    : `${values.slice(0, 25).join(",")},...(+${values.length - 25})`;
  console.log(`C2_QUEUE_GEOS=${summarizeQueue(result.c2QueueGeos)}`);
  console.log(`C3_QUEUE_GEOS=${summarizeQueue(result.c3QueueGeos)}`);
  console.log("APPLY_ALLOWED=false");
  console.log("PRODUCTION_TOUCHED=false");
  console.log("MAP_COLORS_CHANGED=false");
  console.log("SSOT_CHANGED=false");
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    console.error(`REVALIDATION_ERROR=${error?.stack || error}`);
    process.exitCode = 1;
  });
}
