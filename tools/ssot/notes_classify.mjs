import {
  isPlaceholderNote,
  normalizeNotesKind,
  normalizeText
} from "../wiki/notes_quality.mjs";

function classifyNotesLevel(claim) {
  const notesText = normalizeText(claim?.notes_text || "");
  const notesRaw = String(claim?.notes_raw || "");
  const reasonCode = String(claim?.notes_reason_code || "");
  const kind = normalizeNotesKind(claim);
  if (!notesText) {
    if (reasonCode === "NO_WIKI_SECTION") {
      return "BASIC";
    }
    return "PLACEHOLDER";
  }
  if (isPlaceholderNote(notesText, notesRaw, kind)) {
    return "PLACEHOLDER";
  }
  if (kind === "MIN_ONLY" || /^Main article:/i.test(notesText)) {
    return "MIN_ONLY";
  }
  if (kind === "RICH") {
    return "RICH";
  }
  return "BASIC";
}

export { classifyNotesLevel };
