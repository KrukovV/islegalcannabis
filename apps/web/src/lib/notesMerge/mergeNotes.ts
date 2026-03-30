export type NotesMergeStatus = {
  rec: string;
  med: string;
};

export type NotesMergeSnapshot = {
  notesText?: string;
  notesSourceStrength?: number;
  notesStatusHash?: string;
  status: NotesMergeStatus;
};

export type NotesMergeResult = {
  notesText: string;
  notesSourceStrength: number;
  notesStatusHash: string;
  notesDeltaReason: "UNCHANGED_STATUS" | "STATUS_CHANGED";
  notesDeltaAddedText: string;
  preservedStrongerNotes: boolean;
};

function normalizeText(value: string | undefined): string {
  return String(value || "").trim();
}

function normalizeStrength(value: number | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

function buildStatusHash(status: NotesMergeStatus): string {
  return `${String(status.rec || "").trim()}|${String(status.med || "").trim()}`;
}

function addedText(previousText: string, currentText: string): string {
  if (!currentText) return "";
  if (!previousText) return currentText;
  if (currentText === previousText || previousText.includes(currentText)) return "";
  return currentText;
}

export function mergeNotesSnapshots(
  previous: NotesMergeSnapshot | null | undefined,
  current: NotesMergeSnapshot
): NotesMergeResult {
  const previousText = normalizeText(previous?.notesText);
  const currentText = normalizeText(current.notesText);
  const previousStrength = normalizeStrength(previous?.notesSourceStrength);
  const currentStrength = normalizeStrength(current.notesSourceStrength);
  const previousHash = normalizeText(previous?.notesStatusHash) || buildStatusHash(previous?.status || { rec: "", med: "" });
  const currentHash = normalizeText(current.notesStatusHash) || buildStatusHash(current.status);
  const statusChanged = Boolean(previous) && previousHash !== currentHash;

  if (statusChanged) {
    return {
      notesText: currentText || previousText,
      notesSourceStrength: Math.max(currentStrength, previousStrength),
      notesStatusHash: currentHash,
      notesDeltaReason: "STATUS_CHANGED",
      notesDeltaAddedText: addedText(previousText, currentText),
      preservedStrongerNotes: false
    };
  }

  if (previousStrength > currentStrength) {
    const extra = addedText(previousText, currentText);
    return {
      notesText: extra ? `${previousText}\n\n${extra}`.trim() : previousText,
      notesSourceStrength: previousStrength,
      notesStatusHash: previousHash || currentHash,
      notesDeltaReason: "UNCHANGED_STATUS",
      notesDeltaAddedText: extra,
      preservedStrongerNotes: true
    };
  }

  const chosenText =
    currentStrength > previousStrength
      ? currentText || previousText
      : currentText.length >= previousText.length
        ? currentText || previousText
        : previousText;

  return {
    notesText: chosenText,
    notesSourceStrength: Math.max(currentStrength, previousStrength),
    notesStatusHash: currentHash || previousHash,
    notesDeltaReason: "UNCHANGED_STATUS",
    notesDeltaAddedText: addedText(previousText, currentText),
    preservedStrongerNotes: false
  };
}
