import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function stripScriptsStylesNav(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ");
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]+>/g, " ");
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function extractTitle(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? normalizeText(stripHtml(match[1] || "")) : "";
}

function hasLawMarker(value) {
  const text = String(value || "");
  return [
    /\b(act|law|legislation|code|gazette|regulation|statute|ordinance|bill|parliament)\b/i,
    /\b(law no|act no|no\.)\b/i,
    /\b(article|section|chapter)\b/i,
    /\b(published|entered into force)\b/i,
    /\bofficial journal\b/i,
    /\bofficial gazette\b/i,
    /\bjournal officiel\b/i,
    /\bgazette officielle\b/i,
    /\bgazeta zyrtare\b/i,
    /\bgazeta\b/i,
    /\bligj\b/i,
    /\bligji\b/i,
    /\bgesetz\b/i,
    /\bloi\b/i,
    /\blegge\b/i,
    /\bley\b/i
  ].some((pattern) => pattern.test(text));
}

function hasDrugMarker(value) {
  const text = String(value || "");
  return [
    /\b(drug|drugs|narcotic|narcotics|controlled substance|controlled drug)\b/i,
    /\b(cannabis|marijuana|marihuana|hemp|hashish|ganja|thc|cbd|cannabidiol|tetrahydrocannabinol|kanabis|hashash)\b/i,
    /\bmarihuan[ae\u00eb]\b/i,
    /\bnarkotik[e\u00eb]?\b/i,
    /\b(тгк)\b/i
  ].some((pattern) => pattern.test(text));
}

function countLawStructureHits(text) {
  const patterns = [
    /\bsection\b/i,
    /\barticle\b/i,
    /\bchapter\b/i,
    /\blaw no\.?\b/i,
    /\bact no\.?\b/i,
    /\bofficial gazette\b/i,
    /\bofficial journal\b/i,
    /\bentered into force\b/i,
    /\bpublished\b/i,
    /\bgazeta zyrtare\b/i,
    /\bligj\b/i
  ];
  let count = 0;
  for (const pattern of patterns) {
    if (pattern.test(text)) count += 1;
  }
  return count;
}

function isDeniedUrl(url) {
  const target = String(url || "").toLowerCase();
  return ["news", "press", "blog", "forum", "map", "social"].some((token) =>
    target.includes(token)
  );
}

function isPdfSnapshot(snapshotPath) {
  return String(snapshotPath || "").toLowerCase().endsWith(".pdf");
}

function readPdfText(snapshotPath) {
  const ocrPath = path.join(path.dirname(snapshotPath), "ocr.txt");
  if (fs.existsSync(ocrPath)) {
    return { text: fs.readFileSync(ocrPath, "utf8"), ocr_ran: false };
  }
  const ocrScript = path.join(process.cwd(), "tools", "ocr", "ocr_pdf.sh");
  if (!fs.existsSync(ocrScript)) return { text: "", ocr_ran: false };
  const res = spawnSync(ocrScript, [snapshotPath, ocrPath], { stdio: "ignore" });
  if (res.status === 0 && fs.existsSync(ocrPath)) {
    return { text: fs.readFileSync(ocrPath, "utf8"), ocr_ran: true };
  }
  return { text: "", ocr_ran: true };
}

function isPdfLawUrl(url) {
  const target = String(url || "").toLowerCase();
  return [
    "law",
    "act",
    "code",
    "gazette",
    "regulation",
    "ordinance",
    "statute",
    "bill",
    "legislation",
    "ligj",
    "gazeta"
  ].some((token) => target.includes(token));
}

export function isLawPageFromSnapshot(snapshotPath, url) {
  if (!snapshotPath || !fs.existsSync(snapshotPath)) {
    return { ok: false, reason: "SNAPSHOT_MISSING", law_marker_found: false };
  }
  if (isDeniedUrl(url)) {
    return { ok: false, reason: "DENY_URL", law_marker_found: false };
  }
  if (isPdfSnapshot(snapshotPath)) {
    const pdfResult = readPdfText(snapshotPath);
    const normalized = normalizeText(pdfResult.text);
    const lawMarker = isPdfLawUrl(url) || hasLawMarker(normalized);
    const cannabisMarker = hasDrugMarker(normalized);
    const structureCount = countLawStructureHits(normalized);
    const ok = lawMarker && structureCount >= 1;
    return {
      ok,
      reason: ok ? "OK" : lawMarker ? "NO_LAW_STRUCTURE" : "NO_LAW_MARKER",
      law_marker_found: lawMarker,
      cannabis_marker_found: cannabisMarker,
      structure_count: structureCount,
      title: "",
      is_pdf: true,
      ocr_ran: pdfResult.ocr_ran,
      ocr_text_len: normalized.length
    };
  }
  const raw = fs.readFileSync(snapshotPath, "utf8");
  const cleaned = stripScriptsStylesNav(raw);
  const title = extractTitle(cleaned);
  const text = normalizeText(stripHtml(cleaned));
  const lawMarker = hasLawMarker(`${url} ${title} ${text}`);
  const drugMarker = hasDrugMarker(`${url} ${title} ${text}`);
  const structureCount = countLawStructureHits(text);
  if (!lawMarker) {
    return {
      ok: false,
      reason: "NO_LAW_MARKER",
      law_marker_found: false,
      cannabis_marker_found: drugMarker,
      structure_count: structureCount,
      title,
      is_pdf: false
    };
  }
  if (structureCount < 2) {
    return {
      ok: false,
      reason: "NO_LAW_STRUCTURE",
      law_marker_found: lawMarker,
      cannabis_marker_found: drugMarker,
      structure_count: structureCount,
      title,
      is_pdf: false
    };
  }
  return {
    ok: true,
    reason: "OK",
    law_marker_found: lawMarker,
    cannabis_marker_found: drugMarker,
    structure_count: structureCount,
    title,
    is_pdf: false
  };
}
