export type NotesEvidenceDelta = "NONE" | "SOFT_CONFLICT" | "STRONG_CONFLICT";

export type NotesEvidenceSourceType = "none" | "wiki_note" | "official_note" | "merged_note";

export type NotesExplainability = {
  notesInterpretationSummary: string;
  notesTriggerPhrases: string[];
  evidenceDelta: NotesEvidenceDelta;
  evidenceDeltaApproved: boolean;
  evidenceDeltaReason: string | null;
  evidenceSourceType: NotesEvidenceSourceType;
  triggerPhraseExcerpt: string | null;
  doesChangeFinalStatus: boolean;
};

type EffectiveStatus = "Legal" | "Decrim" | "Illegal" | "Unenforced" | "Limited" | "Unknown";

type StatusTrigger = {
  rec?: EffectiveStatus;
  med?: EffectiveStatus;
  phrase: string;
};

const STATUS_WEIGHT: Record<EffectiveStatus, number> = {
  Unknown: 0,
  Illegal: 1,
  Limited: 2,
  Unenforced: 2,
  Decrim: 3,
  Legal: 4
};

function normalizeText(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeStatus(value: string | null | undefined): EffectiveStatus {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "legal") return "Legal";
  if (normalized === "decriminalized" || normalized === "decrim") return "Decrim";
  if (normalized === "illegal") return "Illegal";
  if (normalized === "unenforced") return "Unenforced";
  if (normalized === "limited") return "Limited";
  return "Unknown";
}

function inferSourceType(notesOur: string, notesWiki: string): NotesEvidenceSourceType {
  if (notesOur && notesWiki) return "merged_note";
  if (notesOur) return "official_note";
  if (notesWiki) return "wiki_note";
  return "none";
}

function pushTrigger(triggers: StatusTrigger[], phrase: string, next: Partial<StatusTrigger>) {
  const cleaned = normalizeText(phrase);
  if (!cleaned) return;
  triggers.push({
    phrase: cleaned,
    rec: next.rec,
    med: next.med
  });
}

function collectTriggers(text: string): StatusTrigger[] {
  const triggers: StatusTrigger[] = [];
  const sentences = String(text || "")
    .split(/(?<=[.!?;])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (/\billegal\b|\bprohibit(?:ed)?\b|\bbanned?\b/.test(lower)) {
      pushTrigger(triggers, sentence, { rec: "Illegal", med: "Illegal" });
      continue;
    }
    if (/\bdecriminal/.test(lower)) {
      pushTrigger(triggers, sentence, { rec: "Decrim" });
      continue;
    }
    if (/\bunenforced\b|\bnot enforced\b|\brarely enforced\b|\btolerated\b|\blax enforcement\b/.test(lower)) {
      pushTrigger(triggers, sentence, { rec: "Unenforced" });
      continue;
    }
    if (/\bmedical\b/.test(lower) && /\b(legal|allowed|permitted|regulated)\b/.test(lower)) {
      pushTrigger(triggers, sentence, { med: "Legal" });
      continue;
    }
    if (/\bmedical\b/.test(lower) && /\b(limited|restricted|only)\b/.test(lower)) {
      pushTrigger(triggers, sentence, { med: "Limited" });
      continue;
    }
    if (/\b(legal|allowed|permitted|regulated|lawful)\b/.test(lower)) {
      pushTrigger(triggers, sentence, { rec: "Legal" });
    }
  }

  return triggers;
}

function highestImpliedStatus(
  triggers: StatusTrigger[],
  kind: "rec" | "med"
): EffectiveStatus {
  let best: EffectiveStatus = "Unknown";
  for (const trigger of triggers) {
    const next = kind === "rec" ? trigger.rec : trigger.med;
    if (!next) continue;
    if (STATUS_WEIGHT[next] > STATUS_WEIGHT[best]) {
      best = next;
    }
  }
  return best;
}

function compareEvidence(
  finalStatus: EffectiveStatus,
  impliedStatus: EffectiveStatus
): NotesEvidenceDelta {
  if (STATUS_WEIGHT[impliedStatus] <= STATUS_WEIGHT[finalStatus]) return "NONE";
  const diff = STATUS_WEIGHT[impliedStatus] - STATUS_WEIGHT[finalStatus];
  return diff >= 2 ? "STRONG_CONFLICT" : "SOFT_CONFLICT";
}

export function buildNotesExplainability(input: {
  notesOur?: string | null;
  notesWiki?: string | null;
  finalRecStatus?: string | null;
  finalMedStatus?: string | null;
  evidenceDeltaApproved?: boolean;
}): NotesExplainability {
  const notesOur = normalizeText(input.notesOur);
  const notesWiki = normalizeText(input.notesWiki);
  const combined = [notesOur, notesWiki].filter(Boolean).join("\n\n").trim();
  const evidenceSourceType = inferSourceType(notesOur, notesWiki);
  const triggers = collectTriggers(combined);
  const triggerPhrases = triggers.map((item) => item.phrase).slice(0, 5);
  const finalRecStatus = normalizeStatus(input.finalRecStatus);
  const finalMedStatus = normalizeStatus(input.finalMedStatus);
  const impliedRec = highestImpliedStatus(triggers, "rec");
  const impliedMed = highestImpliedStatus(triggers, "med");
  const recDelta = compareEvidence(finalRecStatus, impliedRec);
  const medDelta = compareEvidence(finalMedStatus, impliedMed);
  const evidenceDelta =
    recDelta === "STRONG_CONFLICT" || medDelta === "STRONG_CONFLICT"
      ? "STRONG_CONFLICT"
      : recDelta === "SOFT_CONFLICT" || medDelta === "SOFT_CONFLICT"
        ? "SOFT_CONFLICT"
        : "NONE";
  const evidenceDeltaApproved = input.evidenceDeltaApproved === true;
  const doesChangeFinalStatus = evidenceDelta !== "NONE" && evidenceDeltaApproved;

  let notesInterpretationSummary = "Notes only explain the SSOT status; they do not change the final status.";
  let evidenceDeltaReason: string | null = null;
  if (!combined) {
    notesInterpretationSummary = "No notes available for interpretation.";
  } else if (triggerPhrases.length === 0) {
    notesInterpretationSummary = "Notes are present, but no status trigger phrases were detected.";
  } else if (evidenceDelta !== "NONE") {
    notesInterpretationSummary = "Notes suggest stronger status than Wiki/SSOT, but this is explainability only.";
    evidenceDeltaReason = [
      recDelta !== "NONE" ? `recreational:${finalRecStatus}->${impliedRec}` : "",
      medDelta !== "NONE" ? `medical:${finalMedStatus}->${impliedMed}` : ""
    ]
      .filter(Boolean)
      .join(", ");
  }

  return {
    notesInterpretationSummary,
    notesTriggerPhrases: triggerPhrases,
    evidenceDelta,
    evidenceDeltaApproved,
    evidenceDeltaReason,
    evidenceSourceType,
    triggerPhraseExcerpt: triggerPhrases[0] || null,
    doesChangeFinalStatus
  };
}
