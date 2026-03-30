import { buildStatusContract, resolveColorKeyFromContract } from "./statusPairMatrix.js";

const STATUS_WEIGHT = {
  Unknown: 0,
  Illegal: 1,
  Limited: 2,
  Unenforced: 2,
  Decrim: 3,
  Legal: 4
};

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function firstMatchingSentence(text, pattern) {
  const sentences = normalizeText(text)
    .split(/(?<=[.!?;])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return sentences.find((sentence) => pattern.test(sentence.toLowerCase())) || null;
}

function normalizeStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "legal" || normalized === "allowed") return "Legal";
  if (normalized === "decriminalized" || normalized === "decrim") return "Decrim";
  if (
    normalized === "limited" ||
    normalized === "restricted" ||
    normalized === "medical" ||
    normalized === "medical only" ||
    normalized === "only medical" ||
    normalized === "legal medical"
  ) {
    return "Limited";
  }
  if (normalized === "unenforced" || normalized === "not enforced" || normalized === "rarely enforced") return "Unenforced";
  if (normalized === "illegal") return "Illegal";
  return "Unknown";
}

function inferSourceType(notesOur, notesWiki) {
  if (notesOur && notesWiki) return "merged_note";
  if (notesOur) return "official_note";
  if (notesWiki) return "wiki_note";
  return "none";
}

function collectTriggers(text) {
  const triggers = [];
  const sentences = normalizeText(text)
    .split(/(?<=[.!?;])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (/\billegal\b|\bprohibit(?:ed)?\b|\bbanned?\b/.test(lower)) {
      triggers.push({ phrase: sentence, rec: "Illegal", med: "Illegal" });
      continue;
    }
    if (/\bdecriminal/.test(lower)) {
      triggers.push({ phrase: sentence, rec: "Decrim" });
      continue;
    }
    if (/\bunenforced\b|\bnot enforced\b|\brarely enforced\b|\btolerated\b|\blax enforcement\b/.test(lower)) {
      triggers.push({ phrase: sentence, rec: "Unenforced" });
      continue;
    }
    if (/\bmedical\b/.test(lower) && /\b(legal|allowed|permitted|regulated)\b/.test(lower)) {
      triggers.push({ phrase: sentence, med: "Legal" });
      continue;
    }
    if (/\bmedical\b/.test(lower) && /\b(limited|restricted|only)\b/.test(lower)) {
      triggers.push({ phrase: sentence, med: "Limited" });
      continue;
    }
    if (/\b(legal|allowed|permitted|regulated|lawful)\b/.test(lower)) {
      triggers.push({ phrase: sentence, rec: "Legal" });
    }
  }
  return triggers;
}

function highestImpliedStatus(triggers, kind) {
  let best = "Unknown";
  for (const trigger of triggers) {
    const next = kind === "rec" ? trigger.rec : trigger.med;
    if (!next) continue;
    if (STATUS_WEIGHT[next] > STATUS_WEIGHT[best]) {
      best = next;
    }
  }
  return best;
}

function compareEvidence(finalStatus, impliedStatus) {
  if (STATUS_WEIGHT[impliedStatus] <= STATUS_WEIGHT[finalStatus]) return "NONE";
  return STATUS_WEIGHT[impliedStatus] - STATUS_WEIGHT[finalStatus] >= 2 ? "STRONG_CONFLICT" : "SOFT_CONFLICT";
}

function resolveStatusProjectionMetadata(params) {
  const finalDiffersFromWiki =
    params.finalRecStatus !== params.wikiRecStatus || params.finalMedStatus !== params.wikiMedStatus;
  const reasons = Array.isArray(params.reasons) ? params.reasons : [];
  let truthSourceLabel = "Unknown";
  if (params.notesAffectFinalStatus) {
    truthSourceLabel = "Reviewed notes rule";
  } else if (params.officialOverride) {
    truthSourceLabel = "Official override";
  } else if (reasons.includes("WIKI_STATE_TABLE_COLOR_RULE")) {
    truthSourceLabel = "Reviewed wiki table rule";
  } else if (params.truthLevel === "WIKI_CORROBORATED") {
    truthSourceLabel = "Wikipedia corroborated by official links";
  } else if (params.truthLevel === "WIKI_ONLY") {
    truthSourceLabel = "Wikipedia";
  } else if (params.truthLevel === "CONFLICT") {
    truthSourceLabel = "Conflict / manual review";
  }
  let effectiveOfficialStrength = "NONE";
  if (params.officialOverride) effectiveOfficialStrength = "OVERRIDE";
  else if (params.truthLevel === "WIKI_CORROBORATED") effectiveOfficialStrength = "CORROBORATED";
  else if (params.officialLinksCount > 0) effectiveOfficialStrength = "LINKS_PRESENT";
  let statusOverrideReason = "NONE";
  if (finalDiffersFromWiki) {
    if (params.notesAffectFinalStatus) statusOverrideReason = params.evidenceDeltaReason || "APPROVED_NOTES_OVERRIDE";
    else if (params.officialOverride) statusOverrideReason = "OFFICIAL_OVERRIDE";
    else if (reasons.includes("WIKI_STATE_TABLE_COLOR_RULE")) statusOverrideReason = "WIKI_TABLE_REVIEWED_RULE";
    else if (params.truthLevel === "CONFLICT") statusOverrideReason = "MANUAL_REVIEW_REQUIRED";
    else statusOverrideReason = "REVIEWED_RULE";
  }
  return {
    truthSourceLabel,
    notesAffectFinalStatus: params.notesAffectFinalStatus,
    statusOverrideReason,
    effectiveOfficialStrength
  };
}

function stableHash(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function buildDatasetHash(rows) {
  const payload = rows
    .map((row) =>
      [
        String(row.geoKey || row.geo || "").toUpperCase(),
        String(row.wikiRecStatus || ""),
        String(row.wikiMedStatus || ""),
        String(row.finalRecStatus || ""),
        String(row.finalMedStatus || ""),
        String(row.finalMapCategory || ""),
        String(row.truthSourceLabel || ""),
        String(row.statusOverrideReason || "")
      ].join("|")
    )
    .sort()
    .join("\n");
  return `${stableHash(payload)}${stableHash(`${payload.length}:${payload}`)}`;
}

export function buildStatusSnapshotMeta(rows) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const builtAtCandidates = normalizedRows
    .map((row) => normalizeText(row?.updatedAt || row?.builtAt || ""))
    .filter(Boolean)
    .sort();
  const builtAt = builtAtCandidates.at(-1) || new Date().toISOString();
  const datasetHash = buildDatasetHash(normalizedRows);
  const compactBuiltAt = builtAt.replace(/[-:TZ.]/g, "").slice(0, 14) || "snapshot";
  return {
    builtAt,
    datasetHash,
    finalSnapshotId: `${compactBuiltAt}-${datasetHash.slice(0, 12)}`
  };
}

export function buildContextExplainability(input) {
  const notesOur = normalizeText(input?.notesOur);
  const notesWiki = normalizeText(input?.notesWiki);
  const combinedNotes = [notesOur, notesWiki].filter(Boolean).join("\n\n").trim();
  const triggers = collectTriggers(combinedNotes);
  const finalRecStatus = normalizeStatus(input?.finalRecStatus);
  const finalMedStatus = normalizeStatus(input?.finalMedStatus);
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
  const evidenceDeltaApproved = input?.evidenceDeltaApproved === true;
  const doesChangeFinalStatus = evidenceDelta !== "NONE" && evidenceDeltaApproved;
  let notesInterpretationSummary = "Notes only explain the SSOT status; they do not change the final status.";
  let evidenceDeltaReason = null;
  if (!combinedNotes) {
    notesInterpretationSummary = "No notes available for interpretation.";
  } else if (triggers.length === 0) {
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
  const enforcementNote =
    firstMatchingSentence(
      combinedNotes,
      /\b(unenforced|not enforced|rarely enforced|tolerated|lax enforcement|enforcement)\b/
    ) || null;
  const socialRealityNote =
    firstMatchingSentence(
      combinedNotes,
      /\b(common|widespread|popular|widely used|social|cultural|prevalence|de facto|coffee shop|openly)\b/
    ) || null;
  const contextNote = firstMatchingSentence(combinedNotes, /./) || null;
  return {
    notesPresent: Boolean(combinedNotes),
    contextNote,
    enforcementNote,
    socialRealityNote,
    notesInterpretationSummary,
    notesTriggerPhrases: triggers.map((item) => item.phrase).slice(0, 5),
    triggerPhraseExcerpt: triggers[0]?.phrase || null,
    evidenceDelta,
    evidenceDeltaApproved,
    evidenceDeltaReason,
    evidenceSourceType: inferSourceType(notesOur, notesWiki),
    notesAffectFinalStatus: doesChangeFinalStatus,
    doesChangeFinalStatus
  };
}

export function buildOfficialEvidence(input) {
  const officialLinks = Array.isArray(input?.officialLinks) ? input.officialLinks.filter(Boolean) : [];
  return {
    officialLinks,
    officialLinksCount: officialLinks.length,
    officialEvidencePresent: officialLinks.length > 0,
    effectiveOfficialStrength: input?.effectiveOfficialStrength || "NONE"
  };
}

export function buildStatusDomainModel(input) {
  const contract = buildStatusContract({
    wikiRecStatus: input?.wikiRecStatus,
    wikiMedStatus: input?.wikiMedStatus,
    finalRecStatus: input?.finalRecStatus,
    finalMedStatus: input?.finalMedStatus,
    evidenceDelta: input?.evidenceDelta,
    evidenceDeltaApproved: input?.evidenceDeltaApproved
  });
  const context = buildContextExplainability({
    notesOur: input?.notesOur,
    notesWiki: input?.notesWiki,
    finalRecStatus: contract.finalRecStatus,
    finalMedStatus: contract.finalMedStatus,
    evidenceDeltaApproved: input?.evidenceDeltaApproved
  });
  const projection = resolveStatusProjectionMetadata({
    truthLevel: input?.truthLevel || "UNKNOWN",
    officialOverride: input?.officialOverride === true,
    officialLinksCount: Array.isArray(input?.officialLinks) ? input.officialLinks.filter(Boolean).length : 0,
    reasons: Array.isArray(input?.reasons) ? input.reasons : [],
    finalRecStatus: contract.finalRecStatus,
    finalMedStatus: contract.finalMedStatus,
    wikiRecStatus: contract.wikiRecStatus,
    wikiMedStatus: contract.wikiMedStatus,
    notesAffectFinalStatus: context.notesAffectFinalStatus,
    evidenceDeltaReason: context.evidenceDeltaReason,
    evidenceDelta: context.evidenceDelta
  });
  const officialEvidence = buildOfficialEvidence({
    officialLinks: input?.officialLinks,
    effectiveOfficialStrength: projection.effectiveOfficialStrength
  });
  const snapshot = input?.snapshotMeta || {
    finalSnapshotId: "UNCONFIRMED",
    builtAt: "UNCONFIRMED",
    datasetHash: "UNCONFIRMED"
  };
  return {
    geoKey: String(input?.geoKey || input?.geo || "").toUpperCase(),
    wikiInput: {
      wikiRecStatus: contract.wikiRecStatus,
      wikiMedStatus: contract.wikiMedStatus,
      wikiSourceUrl: input?.wikiSourceUrl || null
    },
    finalStatus: {
      finalRecStatus: contract.finalRecStatus,
      finalMedStatus: contract.finalMedStatus,
      finalMapCategory: contract.finalMapCategory,
      mapColor: resolveColorKeyFromContract({ mapCategory: contract.finalMapCategory }),
      finalSnapshotId: snapshot.finalSnapshotId,
      truthSourceLabel: projection.truthSourceLabel,
      statusOverrideReason: projection.statusOverrideReason
    },
    contextExplainability: context,
    officialEvidence,
    snapshot: snapshot
  };
}
