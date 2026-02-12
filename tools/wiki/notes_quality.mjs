function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripWikiMarkupForGate(value) {
  let text = String(value || "");
  text = text.replace(/<ref[\s\S]*?<\/ref>/gi, " ");
  text = text.replace(/<ref[^>]*\/?>/gi, " ");
  text = text.replace(/\{\{[\s\S]*?\}\}/g, " ");
  text = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  text = text.replace(/\[\[([^\]]+)\]\]/g, "$1");
  text = text.replace(/<[^>]+>/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

function isMainOnlyRaw(value) {
  const text = normalizeText(value);
  return /^\{\{\s*main\s*\|[^}]+\}\}$/i.test(text);
}

function normalizeNotesKind(claim) {
  const kind = String(claim?.notes_kind || "").toUpperCase();
  if (kind === "RICH" || kind === "MIN_ONLY" || kind === "NONE") return kind;
  const notesText = String(claim?.notes_text || "");
  if (!notesText) return "NONE";
  if (/^Main article:/i.test(notesText)) return "MIN_ONLY";
  return "RICH";
}

function isPlaceholderNote(text, raw, kind) {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (isMainOnlyRaw(raw)) return false;
  if (kind === "MIN_ONLY") return false;
  if (/^Main article:/i.test(normalized)) {
    const remainder = normalized.replace(/^Main article:[^\\.]*\\.?/i, "").trim();
    if (remainder.length > 0) return false;
  }
  if (/^Cannabis in\s+/i.test(normalized)) {
    const rawText = stripWikiMarkupForGate(raw);
    if (!rawText) return true;
    if (rawText !== normalized && rawText.length > normalized.length) {
      return true;
    }
    return false;
  }
  if (/^Main articles?:/i.test(normalized)) return true;
  if (/^Main article:/i.test(normalized)) return true;
  if (/^See also:/i.test(normalized)) return true;
  if (/^Further information:/i.test(normalized)) return true;
  return false;
}

function isMinOnlyOk(claim) {
  return normalizeNotesKind(claim) === "MIN_ONLY" &&
    String(claim?.notes_reason_code || "") === "NO_EXTRA_TEXT";
}

function classifyNotes(claim, minLen) {
  const notesText = String(claim?.notes_text || "");
  const notesRaw = String(claim?.notes_raw || "");
  const kind = normalizeNotesKind(claim);
  const isEmpty = !notesText;
  const isPlaceholder = !isEmpty && isPlaceholderNote(notesText, notesRaw, kind);
  const minOnlyOk = isMinOnlyOk(claim);
  const classLabel = isEmpty
    ? "EMPTY"
    : (isPlaceholder ? "PLACEHOLDER" : (kind === "MIN_ONLY" ? "MIN_ONLY" : "RICH"));
  const weakShort = !isEmpty && !isPlaceholder && kind !== "MIN_ONLY" && minLen > 0 && notesText.length < minLen;
  const weakMinOnly = kind === "MIN_ONLY" && !minOnlyOk;
  const isWeak = weakShort || weakMinOnly;
  return {
    kind,
    classLabel,
    isEmpty,
    isPlaceholder,
    isWeak,
    minOnlyOk,
    notesText,
    notesRaw
  };
}

function classifyNotesForCoverage(claim, minOkLen, { allowNumericSignal = true } = {}) {
  const notesText = String(claim?.notes_text || "");
  const notesRaw = String(claim?.notes_raw || "");
  const kind = normalizeNotesKind(claim);
  const isEmpty = !notesText;
  if (isEmpty) {
    return { isEmpty: true, isPlaceholder: false, isWeak: false, isOk: false };
  }
  const notesSource = String(claim?.notes_source || "");
  const reasonCode = String(claim?.notes_reason_code || "");
  if (notesSource === "LEG_TABLE" || reasonCode === "LEG_TABLE") {
    return { isEmpty: false, isPlaceholder: false, isWeak: false, isOk: true };
  }
  const isPlaceholder = isPlaceholderNote(notesText, notesRaw, kind);
  if (isPlaceholder) {
    return { isEmpty: false, isPlaceholder: true, isWeak: true, isOk: false };
  }
  if (kind === "MIN_ONLY" && isMinOnlyOk(claim)) {
    return { isEmpty: false, isPlaceholder: false, isWeak: false, isOk: true };
  }
  const hasNumericSignal = /\d/.test(String(notesText || ""));
  if (notesText.length < minOkLen && (!allowNumericSignal || !hasNumericSignal)) {
    return { isEmpty: false, isPlaceholder: false, isWeak: true, isOk: false };
  }
  return { isEmpty: false, isPlaceholder: false, isWeak: false, isOk: true };
}

export {
  classifyNotes,
  classifyNotesForCoverage,
  isMainOnlyRaw,
  isPlaceholderNote,
  isMinOnlyOk,
  normalizeNotesKind,
  normalizeText
};
