import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { findRepoRoot } from "@/lib/ssotDiff/ssotSnapshotStore";
import { buildEvidencePassportCollection } from "./evidencePassport";

export type CorrectionRequestInput = {
  geo: string;
  organization: string;
  sourceUrl: string;
  licenceReference?: string;
  note?: string;
};

export type CorrectionRequestReceipt = {
  schemaVersion: 1;
  receiptId: string;
  receivedAt: string;
  localOnly: true;
  candidate: {
    geo: string;
    organization: string;
    sourceUrl: string;
    licenceReference: string;
    note: string;
  };
  provenance: {
    classification: "SELF_SUBMITTED_UNTRUSTED_CANDIDATE";
    candidateSha256: string;
  };
  review: {
    state: "PENDING_INDEPENDENT_REVIEW";
    evidenceAccepted: false;
  };
  outcome: {
    state: "NO_AUTOMATIC_CHANGE";
    legalTruthChanged: false;
    storeTruthChanged: false;
    coordinateChanged: false;
    leafChanged: false;
    mapPositionChanged: false;
    rankingChanged: false;
  };
};

export type CorrectionReviewDecision = "NEEDS_MORE_EVIDENCE" | "REJECTED" | "APPROVED_FOR_MANUAL_HANDOFF";

export type CorrectionReviewEvent = {
  schemaVersion: 1;
  eventId: string;
  receiptId: string;
  occurredAt: string;
  localOnly: true;
  kind: "ASSIGNED" | "EVIDENCE_DECISION" | "OUTCOME_RECORDED";
  reviewerId: string;
  decision: CorrectionReviewDecision | null;
  note: string;
  evidenceAccepted: false;
  outcome: {
    state: "NO_AUTOMATIC_CHANGE" | "AWAITING_MANUAL_CANONICAL_HANDOFF";
    canonicalReviewOperationId: null;
    legalTruthChanged: false;
    storeTruthChanged: false;
    coordinateChanged: false;
    leafChanged: false;
    mapPositionChanged: false;
    rankingChanged: false;
  };
};

export type CorrectionReviewQueueItem = {
  receipt: CorrectionRequestReceipt;
  events: CorrectionReviewEvent[];
  assignedReviewerId: string | null;
  state: "PENDING_ASSIGNMENT" | "ASSIGNED" | CorrectionReviewDecision;
};

function normalizeText(value: unknown, maxLength: number) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeHttpsUrl(value: unknown) {
  const text = normalizeText(value, 2_048);
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error("CORRECTION_REQUEST_SOURCE_URL_INVALID");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("CORRECTION_REQUEST_SOURCE_URL_INVALID");
  return parsed.toString();
}

function canonicalGeos() {
  return new Set(buildEvidencePassportCollection().passports.map((passport) => passport.geo));
}

export function validateCorrectionRequestInput(input: CorrectionRequestInput) {
  const geo = normalizeText(input.geo, 16).toUpperCase();
  if (!canonicalGeos().has(geo)) throw new Error(`CORRECTION_REQUEST_UNKNOWN_GEO=${geo || "EMPTY"}`);
  const organization = normalizeText(input.organization, 180);
  if (!organization) throw new Error("CORRECTION_REQUEST_ORGANIZATION_REQUIRED");
  const sourceUrl = normalizeHttpsUrl(input.sourceUrl);
  const licenceReference = normalizeText(input.licenceReference, 180);
  const note = normalizeText(input.note, 2_000);
  if (!licenceReference && !note) throw new Error("CORRECTION_REQUEST_EVIDENCE_DESCRIPTION_REQUIRED");
  return { geo, organization, sourceUrl, licenceReference, note };
}

export function correctionRequestInboxPath(repoRoot = findRepoRoot(process.cwd())) {
  const override = process.env.ISLEGAL_B2B_CORRECTION_INBOX_PATH;
  return override ? path.resolve(override) : path.join(repoRoot, "cache", "b2b", "correction_requests.jsonl");
}

export function correctionReviewEventsPath(repoRoot = findRepoRoot(process.cwd())) {
  const override = process.env.ISLEGAL_B2B_CORRECTION_REVIEW_PATH;
  return override ? path.resolve(override) : path.join(repoRoot, "cache", "b2b", "correction_review_events.jsonl");
}

function readJsonl<T>(filePath: string, label: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line) as T;
    } catch {
      throw new Error(`${label}_JSONL_INVALID_LINE=${index + 1}`);
    }
  });
}

export function readCorrectionRequestReceipts(filePath = correctionRequestInboxPath()) {
  const receipts = readJsonl<CorrectionRequestReceipt>(filePath, "CORRECTION_REQUEST_INBOX");
  const ids = new Set<string>();
  for (const receipt of receipts) {
    if (receipt.schemaVersion !== 1 || receipt.localOnly !== true || !receipt.receiptId || ids.has(receipt.receiptId)) {
      throw new Error(`CORRECTION_REQUEST_RECEIPT_INVALID=${receipt.receiptId || "EMPTY"}`);
    }
    ids.add(receipt.receiptId);
  }
  return receipts;
}

export function readCorrectionReviewEvents(filePath = correctionReviewEventsPath()) {
  const events = readJsonl<CorrectionReviewEvent>(filePath, "CORRECTION_REVIEW_EVENTS");
  const ids = new Set<string>();
  for (const event of events) {
    if (event.schemaVersion !== 1 || event.localOnly !== true || !event.eventId || ids.has(event.eventId) || !Number.isFinite(Date.parse(event.occurredAt))) {
      throw new Error(`CORRECTION_REVIEW_EVENT_INVALID=${event.eventId || "EMPTY"}`);
    }
    if (event.evidenceAccepted !== false || Object.values(event.outcome).some((value) => typeof value === "boolean" && value !== false)) {
      throw new Error(`CORRECTION_REVIEW_EVENT_MUTATION_BOUNDARY_INVALID=${event.eventId}`);
    }
    const decisionAllowed = event.decision === "NEEDS_MORE_EVIDENCE" || event.decision === "REJECTED" || event.decision === "APPROVED_FOR_MANUAL_HANDOFF";
    if (!event.reviewerId || !["ASSIGNED", "EVIDENCE_DECISION", "OUTCOME_RECORDED"].includes(event.kind)) {
      throw new Error(`CORRECTION_REVIEW_EVENT_CLASSIFICATION_INVALID=${event.eventId}`);
    }
    if ((event.kind === "ASSIGNED" && event.decision !== null) || (event.kind !== "ASSIGNED" && !decisionAllowed)) {
      throw new Error(`CORRECTION_REVIEW_EVENT_DECISION_INVALID=${event.eventId}`);
    }
    const expectedOutcome = event.kind === "OUTCOME_RECORDED" && event.decision === "APPROVED_FOR_MANUAL_HANDOFF"
      ? "AWAITING_MANUAL_CANONICAL_HANDOFF"
      : "NO_AUTOMATIC_CHANGE";
    if (event.outcome.state !== expectedOutcome) throw new Error(`CORRECTION_REVIEW_EVENT_OUTCOME_INVALID=${event.eventId}`);
    if (event.outcome.canonicalReviewOperationId !== null) throw new Error(`CORRECTION_REVIEW_CANONICAL_OPERATION_UNVERIFIED=${event.eventId}`);
    if (event.kind !== "ASSIGNED" && !event.note) throw new Error(`CORRECTION_REVIEW_EVENT_NOTE_REQUIRED=${event.eventId}`);
    ids.add(event.eventId);
  }
  return events;
}

export function buildCorrectionReviewQueue(
  receiptsPath = correctionRequestInboxPath(),
  eventsPath = correctionReviewEventsPath()
): CorrectionReviewQueueItem[] {
  const receipts = readCorrectionRequestReceipts(receiptsPath);
  const events = readCorrectionReviewEvents(eventsPath);
  const receiptIds = new Set(receipts.map((receipt) => receipt.receiptId));
  const orphan = events.find((event) => !receiptIds.has(event.receiptId));
  if (orphan) throw new Error(`CORRECTION_REVIEW_EVENT_ORPHAN=${orphan.eventId}`);
  return receipts.map((receipt) => {
    const receiptEvents = events.filter((event) => event.receiptId === receipt.receiptId);
    let assignment: CorrectionReviewEvent | null = null;
    let decision: CorrectionReviewEvent | null = null;
    let outcome: CorrectionReviewEvent | null = null;
    for (const event of receiptEvents) {
      if (event.kind === "ASSIGNED") {
        if (assignment || decision || outcome) throw new Error(`CORRECTION_REVIEW_TRANSITION_INVALID=${event.eventId}`);
        assignment = event;
      } else if (event.kind === "EVIDENCE_DECISION") {
        if (!assignment || decision || outcome || event.reviewerId !== assignment.reviewerId) {
          throw new Error(`CORRECTION_REVIEW_TRANSITION_INVALID=${event.eventId}`);
        }
        decision = event;
      } else {
        if (!assignment || !decision || outcome || event.reviewerId !== assignment.reviewerId || event.decision !== decision.decision) {
          throw new Error(`CORRECTION_REVIEW_TRANSITION_INVALID=${event.eventId}`);
        }
        outcome = event;
      }
    }
    if (decision && !outcome) throw new Error(`CORRECTION_REVIEW_OUTCOME_MISSING=${decision.eventId}`);
    const state: CorrectionReviewQueueItem["state"] = outcome?.decision || (assignment ? "ASSIGNED" : "PENDING_ASSIGNMENT");
    return {
      receipt,
      events: receiptEvents,
      assignedReviewerId: assignment?.reviewerId || null,
      state
    };
  }).sort((left, right) => left.receipt.receivedAt.localeCompare(right.receipt.receivedAt));
}

function noAutomaticOutcome(state: CorrectionReviewEvent["outcome"]["state"]): CorrectionReviewEvent["outcome"] {
  return {
    state,
    canonicalReviewOperationId: null,
    legalTruthChanged: false,
    storeTruthChanged: false,
    coordinateChanged: false,
    leafChanged: false,
    mapPositionChanged: false,
    rankingChanged: false
  };
}

function reviewEvent(
  input: Omit<CorrectionReviewEvent, "schemaVersion" | "eventId" | "localOnly" | "evidenceAccepted" | "outcome"> & {
    outcomeState: CorrectionReviewEvent["outcome"]["state"];
  }
): CorrectionReviewEvent {
  return {
    schemaVersion: 1,
    eventId: `CORREV-${input.occurredAt.replace(/[-:.TZ]/g, "")}-${randomUUID()}`,
    receiptId: input.receiptId,
    occurredAt: input.occurredAt,
    localOnly: true,
    kind: input.kind,
    reviewerId: input.reviewerId,
    decision: input.decision,
    note: input.note,
    evidenceAccepted: false,
    outcome: noAutomaticOutcome(input.outcomeState)
  };
}

function appendCorrectionReviewEvents(events: CorrectionReviewEvent[], filePath = correctionReviewEventsPath()) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`, { encoding: "utf8", flag: "a" });
  return events;
}

function findQueueItem(receiptId: string, receiptsPath?: string, eventsPath?: string) {
  const normalizedReceiptId = normalizeText(receiptId, 180);
  const item = buildCorrectionReviewQueue(receiptsPath, eventsPath).find((candidate) => candidate.receipt.receiptId === normalizedReceiptId);
  if (!item) throw new Error(`CORRECTION_REVIEW_RECEIPT_NOT_FOUND=${normalizedReceiptId || "EMPTY"}`);
  return item;
}

export function assignCorrectionRequestReview(
  input: { receiptId: string; reviewerId: string; note?: string },
  now = new Date(),
  receiptsPath = correctionRequestInboxPath(),
  eventsPath = correctionReviewEventsPath()
) {
  const item = findQueueItem(input.receiptId, receiptsPath, eventsPath);
  if (item.state !== "PENDING_ASSIGNMENT") throw new Error(`CORRECTION_REVIEW_ASSIGNMENT_INVALID_STATE=${item.state}`);
  const reviewerId = normalizeText(input.reviewerId, 120);
  if (!reviewerId) throw new Error("CORRECTION_REVIEW_REVIEWER_REQUIRED");
  const occurredAt = now.toISOString();
  return appendCorrectionReviewEvents([reviewEvent({
    receiptId: item.receipt.receiptId,
    occurredAt,
    kind: "ASSIGNED",
    reviewerId,
    decision: null,
    note: normalizeText(input.note, 1_000),
    outcomeState: "NO_AUTOMATIC_CHANGE"
  })], eventsPath)[0];
}

export function decideCorrectionRequestReview(
  input: { receiptId: string; reviewerId: string; decision: CorrectionReviewDecision; note: string },
  now = new Date(),
  receiptsPath = correctionRequestInboxPath(),
  eventsPath = correctionReviewEventsPath()
) {
  const item = findQueueItem(input.receiptId, receiptsPath, eventsPath);
  if (item.state !== "ASSIGNED") throw new Error(`CORRECTION_REVIEW_DECISION_INVALID_STATE=${item.state}`);
  const reviewerId = normalizeText(input.reviewerId, 120);
  if (!reviewerId || reviewerId !== item.assignedReviewerId) throw new Error("CORRECTION_REVIEW_REVIEWER_MISMATCH");
  const allowed = new Set<CorrectionReviewDecision>(["NEEDS_MORE_EVIDENCE", "REJECTED", "APPROVED_FOR_MANUAL_HANDOFF"]);
  if (!allowed.has(input.decision)) throw new Error("CORRECTION_REVIEW_DECISION_INVALID");
  const note = normalizeText(input.note, 2_000);
  if (!note) throw new Error("CORRECTION_REVIEW_DECISION_NOTE_REQUIRED");
  const occurredAt = now.toISOString();
  const outcomeState = input.decision === "APPROVED_FOR_MANUAL_HANDOFF"
    ? "AWAITING_MANUAL_CANONICAL_HANDOFF" as const
    : "NO_AUTOMATIC_CHANGE" as const;
  return appendCorrectionReviewEvents([
    reviewEvent({ receiptId: item.receipt.receiptId, occurredAt, kind: "EVIDENCE_DECISION", reviewerId, decision: input.decision, note, outcomeState: "NO_AUTOMATIC_CHANGE" }),
    reviewEvent({ receiptId: item.receipt.receiptId, occurredAt, kind: "OUTCOME_RECORDED", reviewerId, decision: input.decision, note, outcomeState })
  ], eventsPath);
}

export function createCorrectionRequestReceipt(input: CorrectionRequestInput, now = new Date()): CorrectionRequestReceipt {
  const candidate = validateCorrectionRequestInput(input);
  const receivedAt = now.toISOString();
  const candidateSha256 = createHash("sha256").update(JSON.stringify(candidate)).digest("hex");
  return {
    schemaVersion: 1,
    receiptId: `CORR-${receivedAt.replace(/[-:.TZ]/g, "")}-${randomUUID()}`,
    receivedAt,
    localOnly: true,
    candidate,
    provenance: { classification: "SELF_SUBMITTED_UNTRUSTED_CANDIDATE", candidateSha256 },
    review: { state: "PENDING_INDEPENDENT_REVIEW", evidenceAccepted: false },
    outcome: {
      state: "NO_AUTOMATIC_CHANGE",
      legalTruthChanged: false,
      storeTruthChanged: false,
      coordinateChanged: false,
      leafChanged: false,
      mapPositionChanged: false,
      rankingChanged: false
    }
  };
}

export function appendCorrectionRequest(receipt: CorrectionRequestReceipt, filePath = correctionRequestInboxPath()) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(receipt)}\n`, { encoding: "utf8", flag: "a" });
  return filePath;
}

export function receiveCorrectionRequest(input: CorrectionRequestInput, now = new Date()) {
  const receipt = createCorrectionRequestReceipt(input, now);
  appendCorrectionRequest(receipt);
  return receipt;
}
