import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { readWikiClaimsSnapshot } from "./wiki_claims_store.mjs";
import { classifyNotesLevel } from "../ssot/notes_classify.mjs";

const ROOT = process.cwd();
const ISO_PATH = path.join(ROOT, "data", "iso3166", "iso3166-1.json");
const REFS_SSOT_PATH = path.join(ROOT, "data", "wiki_ssot", "wiki_refs.json");
const OUTPUT_CLAIMS_PATH = path.join(ROOT, "data", "wiki", "wiki_claims.json");
const OUTPUT_CLAIMS_MAP_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");
const OUTPUT_REFS_PATH = path.join(ROOT, "data", "wiki", "wiki_refs.json");
const OFFICIAL_BADGES_PATH = path.join(ROOT, "data", "wiki", "wiki_official_badges.json");
const SSOT_WRITE = process.env.SSOT_WRITE === "1";
const CLEAR_NOTES = process.env.CLEAR_NOTES === "1";
const CLEAR_NOTES_REASON = String(process.env.CLEAR_NOTES_REASON || "");
const NOTES_MIN_LEN = Number(process.env.NOTES_MIN_LEN || 120) || 120;
const NOTES_REGRESS_PATH = path.join(ROOT, "Reports", "notes_regress.ssot.json");
const NOTES_STATUS_CHANGE_PATH = path.join(ROOT, "Reports", "notes_status_change.json");
const STATUS_CHANGE_PATH = path.join(ROOT, "Reports", "status_change.json");
const notesRegressions = [];
const notesStatusChanges = [];
const statusChanges = [];

function appendCiFinal(line) {
  const file = path.join(ROOT, "Reports", "ci-final.txt");
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${line}\n`);
  } catch {
    // ignore
  }
}

if (!SSOT_WRITE) {
  console.log("SSOT_READONLY=1");
  process.exit(0);
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeAtomic(file, payload) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(dir, `${path.basename(file)}.tmp`);
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2) + "\n");
  fs.renameSync(tmpPath, file);
}

function normalizeMainArticles(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") return { title: entry, url: "" };
      if (entry && typeof entry === "object") {
        return {
          title: String(entry.title || entry.name || ""),
          url: String(entry.url || "")
        };
      }
      return null;
    })
    .filter((entry) => entry && entry.title);
}

function normalizeClaim(entry, fallbackFetchedAt) {
  if (!entry || typeof entry !== "object") return null;
  const geo = String(entry.geo || entry.geo_key || entry.geoKey || entry.geo_id || "").toUpperCase();
  if (!geo) return null;
  return {
    geo_id: geo,
    rec_status: String(
      entry.recreational_status || entry.wiki_rec || entry.rec_status || "Unknown"
    ),
    med_status: String(
      entry.medical_status || entry.wiki_med || entry.med_status || "Unknown"
    ),
    recreational_status: String(
      entry.recreational_status || entry.wiki_rec || entry.rec_status || "Unknown"
    ),
    medical_status: String(
      entry.medical_status || entry.wiki_med || entry.med_status || "Unknown"
    ),
    notes_text: String(entry.notes_text || entry.notes_raw || entry.notes || ""),
    notes_kind: String(entry.notes_kind || ""),
    notes_reason_code: String(entry.notes_reason_code || ""),
    notes_sections_used: Array.isArray(entry.notes_sections_used) ? entry.notes_sections_used : [],
    notes_main_article: String(entry.notes_main_article || ""),
    main_articles: normalizeMainArticles(entry.main_articles || entry.notes_main_articles),
    row_ref: String(entry.row_ref || entry.wiki_row_ref || entry.rowRef || ""),
    wiki_revision_id: String(entry.wiki_revision_id || entry.revision_id || ""),
    fetched_at: String(entry.fetched_at || entry.updated_at || fallbackFetchedAt || "")
  };
}

function normalizeNotesText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPlaceholderNote(value) {
  const normalized = normalizeNotesText(value);
  if (!normalized) return true;
  if (/^Main articles?:/i.test(normalized)) return true;
  if (/^Main article:/i.test(normalized)) return true;
  if (/^See also:/i.test(normalized)) return true;
  if (/^Further information:/i.test(normalized)) return true;
  return false;
}

function isWeakNote(value, kind = "") {
  if (kind === "MIN_ONLY") return false;
  if (kind === "NONE") return true;
  const normalized = normalizeNotesText(value);
  if (!normalized) return true;
  if (isPlaceholderNote(normalized)) return true;
  return normalized.length < NOTES_MIN_LEN;
}

function isWeakerClass(nextClass, prevClass) {
  const order = {
    PLACEHOLDER: 0,
    MIN_ONLY: 1,
    BASIC: 2,
    RICH: 3
  };
  const nextScore = order[String(nextClass || "").toUpperCase()] ?? -1;
  const prevScore = order[String(prevClass || "").toUpperCase()] ?? -1;
  return nextScore >= 0 && prevScore >= 0 && nextScore < prevScore;
}

function recordNotesRegression(geo, prevClass, nextClass, reason) {
  if (!geo) return;
  notesRegressions.push({
    geo,
    prev_class: prevClass,
    next_class: nextClass,
    reason
  });
}

function recordNotesStatusChange(entry) {
  if (!entry || !entry.geo) return;
  notesStatusChanges.push({
    ...entry,
    ts: new Date().toISOString()
  });
}

function recordStatusChange(entry) {
  if (!entry || !entry.geo) return;
  statusChanges.push({
    ...entry,
    ts: new Date().toISOString()
  });
}

function mergeNotes(current, previous) {
  if (!current || typeof current !== "object") return current;
  if (!previous || typeof previous !== "object") return current;
  const currentNotes = normalizeNotesText(current.notes_text || "");
  const previousNotes = normalizeNotesText(previous.notes_text || previous.notes_raw || "");
  const currentKind = String(current.notes_kind || "");
  const previousKind = String(previous.notes_kind || "");
  const currentClass = classifyNotesLevel(current);
  const previousClass = classifyNotesLevel(previous);
  const allowStatusShrink = process.env.ALLOW_STATUS_SHRINK === "1";
  const allowStatusUpgrade = process.env.ALLOW_STATUS_UPGRADE === "1";
  const currRec = String(current.rec_status || current.recreational_status || "");
  const currMed = String(current.med_status || current.medical_status || "");
  const prevRec = String(previous.rec_status || previous.recreational_status || "");
  const prevMed = String(previous.med_status || previous.medical_status || "");
  const isUnknown = (val) => !val || val === "Unknown";
  if (!allowStatusShrink) {
    if (isUnknown(currRec) && !isUnknown(prevRec)) {
      current.rec_status = prevRec;
      current.recreational_status = prevRec;
      recordStatusChange({
        geo: String(current.geo_id || current.geo_key || ""),
        field: "rec",
        old: prevRec,
        next: currRec,
        reason: "STATUS_SHRINK_BLOCKED"
      });
    }
    if (isUnknown(currMed) && !isUnknown(prevMed)) {
      current.med_status = prevMed;
      current.medical_status = prevMed;
      recordStatusChange({
        geo: String(current.geo_id || current.geo_key || ""),
        field: "med",
        old: prevMed,
        next: currMed,
        reason: "STATUS_SHRINK_BLOCKED"
      });
    }
  }
  if (!allowStatusUpgrade) {
    if ((prevRec === "Decrim" || prevRec === "Unenforced") && currRec === "Legal") {
      current.rec_status = prevRec;
      current.recreational_status = prevRec;
      recordStatusChange({
        geo: String(current.geo_id || current.geo_key || ""),
        field: "rec",
        old: prevRec,
        next: currRec,
        reason: "STATUS_UPGRADE_BLOCKED"
      });
    }
    if (prevMed === "Limited" && currMed === "Legal") {
      current.med_status = prevMed;
      current.medical_status = prevMed;
      recordStatusChange({
        geo: String(current.geo_id || current.geo_key || ""),
        field: "med",
        old: prevMed,
        next: currMed,
        reason: "STATUS_UPGRADE_BLOCKED"
      });
    }
  }
  const statusChanged =
    String(current.rec_status || current.recreational_status || "") !==
      String(previous.rec_status || previous.recreational_status || "") ||
    String(current.med_status || current.medical_status || "") !==
      String(previous.med_status || previous.medical_status || "");
  const inferKind = (text) => {
    if (!text) return "NONE";
    if (/^Main article:/i.test(text)) return "MIN_ONLY";
    return "RICH";
  };
  if (!currentKind) {
    const inferred = inferKind(currentNotes);
    current.notes_kind = inferred;
    if (!current.notes_reason_code) {
      current.notes_reason_code = inferred === "MIN_ONLY" ? "NO_EXTRA_TEXT" : "PARSED_SECTIONS";
    }
  }
  if (current.notes_kind === "MIN_ONLY" && !current.notes_reason_code) {
    current.notes_reason_code = "NO_EXTRA_TEXT";
  }
  if (!previousNotes) return current;
  if (!statusChanged && isWeakerClass(currentClass, previousClass)) {
    return {
      ...current,
      notes_text: previousNotes,
      notes_raw: previous.notes_raw || current.notes_raw || previousNotes,
      notes_kind: previousKind,
      notes_reason_code: "NOTES_WEAK_BLOCKED",
      notes_sections_used: Array.isArray(previous.notes_sections_used) && previous.notes_sections_used.length
        ? previous.notes_sections_used
        : current.notes_sections_used,
      notes_main_article: previous.notes_main_article || current.notes_main_article,
      main_articles: Array.isArray(current.main_articles) && current.main_articles.length
        ? current.main_articles
        : normalizeMainArticles(previous.main_articles || previous.notes_main_articles)
    };
  }
  if (!statusChanged && currentNotes.length < previousNotes.length) {
    return {
      ...current,
      notes_text: previousNotes,
      notes_raw: previous.notes_raw || current.notes_raw || previousNotes,
      notes_kind: previousKind,
      notes_reason_code: "NOTES_WEAK_BLOCKED",
      notes_sections_used: Array.isArray(previous.notes_sections_used) && previous.notes_sections_used.length
        ? previous.notes_sections_used
        : current.notes_sections_used,
      notes_main_article: previous.notes_main_article || current.notes_main_article,
      main_articles: Array.isArray(current.main_articles) && current.main_articles.length
        ? current.main_articles
        : normalizeMainArticles(previous.main_articles || previous.notes_main_articles)
    };
  }
  if (!currentNotes && previousNotes && CLEAR_NOTES) {
    if (!CLEAR_NOTES_REASON) {
      console.log("NOTES_CLEAR_DENIED reason=MISSING_CLEAR_NOTES_REASON");
      appendCiFinal("NOTES_CLEAR_DENIED reason=MISSING_CLEAR_NOTES_REASON");
    } else {
      console.log(`NOTES_CLEARED geo=${String(current.geo_id || current.geo_key || \"\")} reason=${CLEAR_NOTES_REASON}`);
      appendCiFinal(`NOTES_CLEARED geo=${String(current.geo_id || current.geo_key || \"\")} reason=${CLEAR_NOTES_REASON}`);
      return current;
    }
  }
  const allowShrink =
    process.env.NOTES_SHRINK_OK === "1" || process.env.ALLOW_NOTES_SHRINK === "1";
  const shrinkReason = String(process.env.NOTES_SHRINK_REASON || "");
  const oldLen = previousNotes.length;
  const newLen = currentNotes.length;
  if (statusChanged) {
    recordNotesStatusChange({
      geo: String(current.geo_id || current.geo_key || ""),
      old_rec: String(previous.rec_status || previous.recreational_status || ""),
      new_rec: String(current.rec_status || current.recreational_status || ""),
      old_med: String(previous.med_status || previous.medical_status || ""),
      new_med: String(current.med_status || current.medical_status || ""),
      old_len: oldLen,
      new_len: newLen,
      old_preview: previousNotes.slice(0, 160),
      new_preview: currentNotes.slice(0, 160),
      reason: "NOTES_STATUS_CHANGED"
    });
  }
  if (previousClass === "RICH" && currentClass !== "RICH") {
    const geo = String(current.geo_id || current.geo_key || "");
    recordNotesRegression(geo, previousClass, currentClass, "RICH_REGRESS");
    if (!statusChanged && (!allowShrink || !shrinkReason)) {
      console.log(`NOTES_FETCH_WEAK geo=${geo} old_len=${oldLen} new_len=${newLen} decision=BLOCK reason=KIND_REGRESS`);
      appendCiFinal(`NOTES_FETCH_WEAK geo=${geo} old_len=${oldLen} new_len=${newLen} decision=BLOCK reason=KIND_REGRESS`);
      return {
        ...current,
        notes_text: previousNotes,
        notes_raw: previous.notes_raw || current.notes_raw || previousNotes,
        notes_kind: previousKind,
        notes_reason_code: "NOTES_WEAK_BLOCKED",
        notes_sections_used: Array.isArray(previous.notes_sections_used) && previous.notes_sections_used.length
          ? previous.notes_sections_used
          : current.notes_sections_used,
        notes_main_article: previous.notes_main_article || current.notes_main_article,
        main_articles: Array.isArray(current.main_articles) && current.main_articles.length
          ? current.main_articles
          : normalizeMainArticles(previous.main_articles || previous.notes_main_articles)
      };
    }
  }
  if (previousClass === "MIN_ONLY" && (currentClass === "PLACEHOLDER")) {
    const geo = String(current.geo_id || current.geo_key || "");
    recordNotesRegression(geo, previousClass, currentClass, "MIN_ONLY_REGRESS");
    if (!statusChanged && (!allowShrink || !shrinkReason)) {
      console.log(`NOTES_FETCH_WEAK geo=${geo} old_len=${oldLen} new_len=${newLen} decision=BLOCK reason=MIN_ONLY_REGRESS`);
      appendCiFinal(`NOTES_FETCH_WEAK geo=${geo} old_len=${oldLen} new_len=${newLen} decision=BLOCK reason=MIN_ONLY_REGRESS`);
      return {
        ...current,
        notes_text: previousNotes,
        notes_raw: previous.notes_raw || current.notes_raw || previousNotes,
        notes_kind: previousKind,
        notes_reason_code: "NOTES_WEAK_BLOCKED",
        notes_sections_used: Array.isArray(previous.notes_sections_used) && previous.notes_sections_used.length
          ? previous.notes_sections_used
          : current.notes_sections_used,
        notes_main_article: previous.notes_main_article || current.notes_main_article,
        main_articles: Array.isArray(current.main_articles) && current.main_articles.length
          ? current.main_articles
          : normalizeMainArticles(previous.main_articles || previous.notes_main_articles)
      };
    }
  }
  if (previousNotes && isWeakNote(currentNotes, currentKind) && !statusChanged) {
    const geo = String(current.geo_id || current.geo_key || "");
    const reason = !currentNotes ? "EMPTY_NEW_NOTES" : "WEAK_NEW_NOTES";
    console.log(`NOTES_FETCH_WEAK geo=${geo} old_len=${oldLen} new_len=${newLen} decision=BLOCK reason=${reason}`);
    appendCiFinal(`NOTES_FETCH_WEAK geo=${geo} old_len=${oldLen} new_len=${newLen} decision=BLOCK reason=${reason}`);
    return {
      ...current,
      notes_text: previousNotes,
      notes_raw: previous.notes_raw || current.notes_raw || previousNotes,
      notes_kind: previousKind,
      notes_reason_code: "NOTES_WEAK_BLOCKED",
      notes_sections_used: Array.isArray(previous.notes_sections_used) && previous.notes_sections_used.length
        ? previous.notes_sections_used
        : current.notes_sections_used,
      notes_main_article: previous.notes_main_article || current.notes_main_article,
      main_articles: Array.isArray(current.main_articles) && current.main_articles.length
        ? current.main_articles
        : normalizeMainArticles(previous.main_articles || previous.notes_main_articles)
    };
  }
  if (!currentNotes && previousNotes && !CLEAR_NOTES) {
    console.log(`NOTES_WRITE geo=${String(current.geo_id || current.geo_key || "")} old_len=${oldLen} new_len=${newLen} decision=BLOCK reason=EMPTY_NEW_NOTES`);
  }
  if (oldLen > 0 && newLen > 0 && newLen < Math.floor(oldLen * 0.6)) {
    if (!statusChanged && (!allowShrink || !shrinkReason)) {
      console.log(`NOTES_WRITE geo=${String(current.geo_id || current.geo_key || \"\")} old_len=${oldLen} new_len=${newLen} decision=BLOCK reason=SHRINK`);
      return {
        ...current,
        notes_text: previousNotes,
        notes_raw: previous.notes_raw || current.notes_raw || previousNotes,
        notes_kind: previousKind,
        notes_reason_code: "NOTES_WEAK_BLOCKED",
        notes_sections_used: Array.isArray(previous.notes_sections_used) && previous.notes_sections_used.length
          ? previous.notes_sections_used
          : current.notes_sections_used,
        notes_main_article: previous.notes_main_article || current.notes_main_article,
        main_articles: Array.isArray(current.main_articles) && current.main_articles.length
          ? current.main_articles
          : normalizeMainArticles(previous.main_articles || previous.notes_main_articles)
      };
    }
    console.log(`NOTES_WRITE geo=${String(current.geo_id || current.geo_key || \"\")} old_len=${oldLen} new_len=${newLen} decision=ALLOW reason=${shrinkReason}`);
  } else if (newLen > oldLen) {
    console.log(`NOTES_WRITE geo=${String(current.geo_id || current.geo_key || \"\")} old_len=${oldLen} new_len=${newLen} decision=ALLOW reason=INCREASE`);
  }
  const currentIsPlaceholder = currentKind === "MIN_ONLY" ? false : isPlaceholderNote(currentNotes);
  const previousIsPlaceholder = previousKind === "MIN_ONLY" ? false : isPlaceholderNote(previousNotes);
  const shouldKeepPrevious =
    !currentNotes ||
    currentIsPlaceholder ||
    (!previousIsPlaceholder && previousNotes.length > currentNotes.length);
  if (!shouldKeepPrevious) return current;
  return {
    ...current,
    notes_text: previousNotes,
    notes_raw: previous.notes_raw || current.notes_raw || previousNotes,
    notes_kind: previousKind,
    notes_reason_code: "NOTES_WEAK_BLOCKED",
    notes_sections_used: Array.isArray(previous.notes_sections_used) && previous.notes_sections_used.length
      ? previous.notes_sections_used
      : current.notes_sections_used,
    notes_main_article: previous.notes_main_article || current.notes_main_article,
    main_articles: Array.isArray(current.main_articles) && current.main_articles.length
      ? current.main_articles
      : normalizeMainArticles(previous.main_articles || previous.notes_main_articles)
  };
}

function normalizeRefsPayload(payload) {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.items)) return payload.items;
  if (payload.items && typeof payload.items === "object") {
    return Object.values(payload.items);
  }
  return [];
}

function normalizeRef(entry) {
  if (!entry || typeof entry !== "object") return null;
  const url = String(entry.url || "").trim();
  if (!url) return null;
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    host = "";
  }
  return {
    url,
    title: String(entry.title || entry.title_hint || ""),
    publisher: String(entry.publisher || entry.host || ""),
    section_hint: String(entry.section_hint || entry.section || ""),
    host
  };
}

function loadIsoEntries() {
  const payload = readJson(ISO_PATH, null);
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  return entries
    .map((entry) => String(entry?.alpha2 || entry?.id || "").toUpperCase())
    .filter(Boolean);
}

function loadOfficialBadgeTotals() {
  if (!fs.existsSync(OFFICIAL_BADGES_PATH)) return { official: 0 };
  try {
    const payload = JSON.parse(fs.readFileSync(OFFICIAL_BADGES_PATH, "utf8"));
    const totals = payload?.totals || {};
    return {
      official: Number(totals.official || 0) || 0,
      non_official: Number(totals.non_official || 0) || 0
    };
  } catch {
    return { official: 0, non_official: 0 };
  }
}

function readClaimsMap(file) {
  const payload = readJson(file, null);
  if (!payload || typeof payload !== "object") return {};
  if (payload.items && typeof payload.items === "object" && !Array.isArray(payload.items)) {
    return payload.items;
  }
  if (Array.isArray(payload)) {
    const map = {};
    for (const entry of payload) {
      const geo = String(entry?.geo_id || entry?.geo || entry?.geo_key || "").toUpperCase();
      if (!geo) continue;
      map[geo] = entry;
    }
    return map;
  }
  return {};
}

function normalizeForCompare(entry) {
  if (!entry || typeof entry !== "object") return "";
  const clone = { ...entry };
  delete clone.fetched_at;
  return JSON.stringify(clone);
}

async function main() {
  if (process.env.UPDATE_MODE !== "1") {
    console.log("SYNC_DISABLED UPDATE_MODE=0");
    return;
  }
  const runAt = new Date().toISOString();
  const refresh = spawnSync(process.execPath, [path.join(ROOT, "tools", "wiki", "wiki_refresh.mjs")], {
    stdio: "inherit"
  });
  if (refresh.status !== 0) {
    process.exit(refresh.status ?? 1);
  }

  const previousClaims =
    readClaimsMap(OUTPUT_CLAIMS_MAP_PATH) || readClaimsMap(OUTPUT_CLAIMS_PATH);
  const claimsSnapshot = readWikiClaimsSnapshot() || [];
  const claimsByGeo = {};
  let revisionId = "";
  for (const item of claimsSnapshot) {
    const normalized = normalizeClaim(item, runAt);
    if (!normalized) continue;
    const previous = previousClaims[normalized.geo_id];
    claimsByGeo[normalized.geo_id] = mergeNotes(normalized, previous);
    if (!revisionId && normalized.wiki_revision_id) {
      revisionId = normalized.wiki_revision_id;
    }
  }
  for (const entry of Object.values(claimsByGeo)) {
    const sectionsUsed = Array.isArray(entry.notes_sections_used)
      ? entry.notes_sections_used
      : [];
    if (sectionsUsed.length === 0 && entry.notes_text) {
      entry.notes_sections_used = ["notes_raw"];
    }
  }

  writeAtomic(OUTPUT_CLAIMS_PATH, {
    generated_at: runAt,
    items: claimsByGeo
  });
  writeAtomic(OUTPUT_CLAIMS_MAP_PATH, {
    generated_at: runAt,
    items: claimsByGeo
  });
  try {
    const payload = {
      generated_at: runAt,
      regressions: notesRegressions,
      total_regressions: notesRegressions.length
    };
    fs.writeFileSync(NOTES_REGRESS_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
  } catch {
    // ignore
  }
  try {
    if (notesStatusChanges.length > 0) {
      const payload = {
        generated_at: runAt,
        changes: notesStatusChanges,
        total_changes: notesStatusChanges.length
      };
      fs.writeFileSync(NOTES_STATUS_CHANGE_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
    } else if (fs.existsSync(NOTES_STATUS_CHANGE_PATH)) {
      fs.unlinkSync(NOTES_STATUS_CHANGE_PATH);
    }
  } catch {
    // ignore
  }
  try {
    if (statusChanges.length > 0) {
      const payload = {
        generated_at: runAt,
        changes: statusChanges,
        total_changes: statusChanges.length
      };
      fs.writeFileSync(STATUS_CHANGE_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
    } else if (fs.existsSync(STATUS_CHANGE_PATH)) {
      fs.unlinkSync(STATUS_CHANGE_PATH);
    }
  } catch {
    // ignore
  }

  const refsPayload = readJson(REFS_SSOT_PATH, null);
  const prevRefsPayload = readJson(OUTPUT_REFS_PATH, null);
  const prevRefsItems = prevRefsPayload?.items && typeof prevRefsPayload.items === "object"
    ? prevRefsPayload.items
    : {};
  const refItems = normalizeRefsPayload(refsPayload);
  const refsByGeo = {};
  let refsTotal = 0;
  for (const item of refItems) {
    const geo = String(item?.geo_key || item?.geo || item?.geo_id || "").toUpperCase();
    if (!geo) continue;
    const refs = Array.isArray(item?.refs) ? item.refs : [];
    const normalizedRefs = [];
    for (const ref of refs) {
      const normalized = normalizeRef(ref);
      if (!normalized) continue;
      normalizedRefs.push(normalized);
    }
    const prevRefs = Array.isArray(prevRefsItems?.[geo]) ? prevRefsItems[geo] : [];
    const keepPrev = prevRefs.length > normalizedRefs.length && prevRefs.length > 0;
    const finalRefs = keepPrev ? prevRefs : normalizedRefs;
    refsTotal += finalRefs.length;
    refsByGeo[geo] = finalRefs;
  }

  writeAtomic(OUTPUT_REFS_PATH, {
    generated_at: runAt,
    items: refsByGeo
  });

  const isoEntries = loadIsoEntries();
  const mainArticlesTotal = Object.values(claimsByGeo).reduce((sum, claim) => {
    const list = Array.isArray(claim?.main_articles) ? claim.main_articles : [];
    return sum + list.length;
  }, 0);
  const claimKeys = new Set(Object.keys(claimsByGeo));
  let updated = 0;
  let unchanged = 0;
  let failed = 0;
  for (const code of isoEntries) {
    const current = claimsByGeo[code];
    if (!current) {
      failed += 1;
      continue;
    }
    const prev = previousClaims[code];
    if (prev) {
      const prevNorm = normalizeForCompare(prev);
      const currNorm = normalizeForCompare(current);
      if (prevNorm === currNorm) unchanged += 1;
      else updated += 1;
    } else {
      updated += 1;
    }
  }
  const geosTotal = isoEntries.length;
  const officialTotals = loadOfficialBadgeTotals();

  console.log(
    `WIKI_SYNC: geos=${geosTotal} claims_ok=${geosTotal - failed} main_articles_total=${mainArticlesTotal} refs_total=${refsTotal}`
  );
  console.log(`WIKI_LINKS: extracted=${refsTotal} stored=${refsTotal}`);
  console.log(
    `REFS_SPLIT: official=${officialTotals.official} non_official=${officialTotals.non_official || 0}`
  );
  console.log(
    `OFFICIAL_BADGE: official_links=${officialTotals.official} non_official=${officialTotals.non_official || 0}`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
