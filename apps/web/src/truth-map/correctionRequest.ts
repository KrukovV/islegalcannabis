import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { findRepoRoot } from "@/lib/ssotDiff/ssotSnapshotStore";
import { validateSourceReviewOperationsRegistry, type SourceReviewOperationsRegistry } from "./sourceReviewOperations";

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
  kind: "ASSIGNED" | "EVIDENCE_DECISION" | "OUTCOME_RECORDED" | "HANDOFF_RECORDED";
  reviewerId: string;
  decision: CorrectionReviewDecision | null;
  note: string;
  evidenceAccepted: false;
  outcome: {
    state: "NO_AUTOMATIC_CHANGE" | "AWAITING_MANUAL_CANONICAL_HANDOFF" | "HANDED_OFF";
    canonicalReviewOperationId: string | null;
    legalTruthChanged: false;
    storeTruthChanged: false;
    coordinateChanged: false;
    leafChanged: false;
    mapPositionChanged: false;
    rankingChanged: false;
  };
  handoff: {
    candidateSha256: string;
    targetOperationId: string;
    sourceReviewRegistrySha256: string;
  } | null;
};

export type CorrectionReviewQueueItem = {
  receipt: CorrectionRequestReceipt;
  events: CorrectionReviewEvent[];
  assignedReviewerId: string | null;
  state: "PENDING_ASSIGNMENT" | "ASSIGNED" | CorrectionReviewDecision | "HANDED_OFF";
  canonicalReviewOperationId: string | null;
};

export type CorrectionReviewQueueSnapshot = {
  queue: CorrectionReviewQueueItem[];
  reviewEventsSha256: string;
};

type CorrectionReviewCommitGuard = {
  filePath: string;
  expectedSha256: string;
  staleLabel: "CORRECTION_REVIEW_RECEIPTS_STALE" | "CORRECTION_REVIEW_SOURCE_REGISTRY_STALE";
  validate: (_bytes: Buffer) => void;
};

export type CorrectionReviewTransactionHooks = {
  beforeCommit?: () => void;
};

type CorrectionReviewLockRecord = {
  schemaVersion: 1;
  ownerPid: number;
  ownerToken: string;
  eventsPath: string;
  stagedPath: string;
};

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

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
  const values = JSON.parse(fs.readFileSync(
    path.join(findRepoRoot(process.cwd()), "data", "reviews", "geo-list-307.json"),
    "utf8"
  )) as string[];
  const geos = new Set(values.map((value) => normalizeText(value, 16).toUpperCase()).filter(Boolean));
  if (values.length !== 307 || geos.size !== 307) throw new Error(`CORRECTION_REQUEST_CANONICAL_UNIVERSE_INVALID=${geos.size}`);
  return geos;
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

export function correctionSourceReviewRegistryPath(repoRoot = findRepoRoot(process.cwd())) {
  const override = process.env.ISLEGAL_B2B_SOURCE_REVIEW_REGISTRY_PATH;
  return override ? path.resolve(override) : path.join(repoRoot, "data", "b2b_evidence", "source_review_operations.json");
}

function sha256Bytes(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function exactFileSnapshot(filePath: string) {
  const bytes = fs.existsSync(filePath) ? fs.readFileSync(filePath) : Buffer.alloc(0);
  return { bytes, sha256: sha256Bytes(bytes) };
}

export function correctionSourceReviewRegistrySha256(filePath = correctionSourceReviewRegistryPath()) {
  return readSourceReviewRegistrySnapshot(filePath).sha256;
}

function normalizeExpectedSha256(value: unknown, label: string) {
  const normalized = normalizeText(value, 64).toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) throw new Error(`${label}_REQUIRED`);
  return normalized;
}

function parseJsonlBytes<T>(bytes: Buffer, label: string): T[] {
  return bytes.toString("utf8").split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line) as T;
    } catch {
      throw new Error(`${label}_JSONL_INVALID_LINE=${index + 1}`);
    }
  });
}

function validateCorrectionRequestReceipts(receipts: CorrectionRequestReceipt[]) {
  const ids = new Set<string>();
  for (const receipt of receipts) {
    if (
      receipt.schemaVersion !== 1
      || receipt.localOnly !== true
      || !receipt.receiptId
      || ids.has(receipt.receiptId)
      || !Number.isFinite(Date.parse(receipt.receivedAt))
      || receipt.provenance?.classification !== "SELF_SUBMITTED_UNTRUSTED_CANDIDATE"
      || receipt.review?.state !== "PENDING_INDEPENDENT_REVIEW"
      || receipt.review?.evidenceAccepted !== false
      || receipt.outcome?.state !== "NO_AUTOMATIC_CHANGE"
      || Object.values(receipt.outcome || {}).some((value) => typeof value === "boolean" && value !== false)
    ) {
      throw new Error(`CORRECTION_REQUEST_RECEIPT_INVALID=${receipt.receiptId || "EMPTY"}`);
    }
    const candidate = validateCorrectionRequestInput(receipt.candidate);
    if (JSON.stringify(candidate) !== JSON.stringify(receipt.candidate)) {
      throw new Error(`CORRECTION_REQUEST_CANDIDATE_INVALID=${receipt.receiptId}`);
    }
    const candidateSha256 = sha256Bytes(JSON.stringify(receipt.candidate));
    if (receipt.provenance.candidateSha256 !== candidateSha256) {
      throw new Error(`CORRECTION_REQUEST_CANDIDATE_SHA256_MISMATCH=${receipt.receiptId}`);
    }
    ids.add(receipt.receiptId);
  }
  return receipts;
}

function parseCorrectionRequestReceipts(bytes: Buffer) {
  return validateCorrectionRequestReceipts(parseJsonlBytes<CorrectionRequestReceipt>(bytes, "CORRECTION_REQUEST_INBOX"));
}

export function readCorrectionRequestReceipts(filePath = correctionRequestInboxPath()) {
  return parseCorrectionRequestReceipts(exactFileSnapshot(filePath).bytes);
}

function validateCorrectionReviewEvents(events: CorrectionReviewEvent[]) {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.schemaVersion !== 1 || event.localOnly !== true || !event.eventId || ids.has(event.eventId) || !Number.isFinite(Date.parse(event.occurredAt))) {
      throw new Error(`CORRECTION_REVIEW_EVENT_INVALID=${event.eventId || "EMPTY"}`);
    }
    if (event.evidenceAccepted !== false || Object.values(event.outcome).some((value) => typeof value === "boolean" && value !== false)) {
      throw new Error(`CORRECTION_REVIEW_EVENT_MUTATION_BOUNDARY_INVALID=${event.eventId}`);
    }
    const decisionAllowed = event.decision === "NEEDS_MORE_EVIDENCE" || event.decision === "REJECTED" || event.decision === "APPROVED_FOR_MANUAL_HANDOFF";
    if (!event.reviewerId || !["ASSIGNED", "EVIDENCE_DECISION", "OUTCOME_RECORDED", "HANDOFF_RECORDED"].includes(event.kind)) {
      throw new Error(`CORRECTION_REVIEW_EVENT_CLASSIFICATION_INVALID=${event.eventId}`);
    }
    if ((event.kind === "ASSIGNED" && event.decision !== null) || (event.kind !== "ASSIGNED" && !decisionAllowed)) {
      throw new Error(`CORRECTION_REVIEW_EVENT_DECISION_INVALID=${event.eventId}`);
    }
    const expectedOutcome = event.kind === "HANDOFF_RECORDED"
      ? "HANDED_OFF"
      : event.kind === "OUTCOME_RECORDED" && event.decision === "APPROVED_FOR_MANUAL_HANDOFF"
      ? "AWAITING_MANUAL_CANONICAL_HANDOFF"
      : "NO_AUTOMATIC_CHANGE";
    if (event.outcome.state !== expectedOutcome) throw new Error(`CORRECTION_REVIEW_EVENT_OUTCOME_INVALID=${event.eventId}`);
    const handoff = event.handoff ?? null;
    if (event.kind === "HANDOFF_RECORDED") {
      if (
        event.decision !== "APPROVED_FOR_MANUAL_HANDOFF"
        || !handoff
        || !handoff.targetOperationId
        || !SHA256_PATTERN.test(handoff.candidateSha256)
        || !SHA256_PATTERN.test(handoff.sourceReviewRegistrySha256)
        || event.outcome.canonicalReviewOperationId !== handoff.targetOperationId
      ) throw new Error(`CORRECTION_REVIEW_HANDOFF_BINDING_INVALID=${event.eventId}`);
    } else if (handoff !== null || event.outcome.canonicalReviewOperationId !== null) {
      throw new Error(`CORRECTION_REVIEW_CANONICAL_OPERATION_UNVERIFIED=${event.eventId}`);
    }
    if (event.kind !== "ASSIGNED" && !event.note) throw new Error(`CORRECTION_REVIEW_EVENT_NOTE_REQUIRED=${event.eventId}`);
    ids.add(event.eventId);
  }
  return events;
}

export function readCorrectionReviewEvents(filePath = correctionReviewEventsPath()) {
  return validateCorrectionReviewEvents(parseJsonlBytes<CorrectionReviewEvent>(exactFileSnapshot(filePath).bytes, "CORRECTION_REVIEW_EVENTS"));
}

function buildCorrectionReviewQueueFrom(receipts: CorrectionRequestReceipt[], events: CorrectionReviewEvent[]): CorrectionReviewQueueItem[] {
  const receiptIds = new Set(receipts.map((receipt) => receipt.receiptId));
  const orphan = events.find((event) => !receiptIds.has(event.receiptId));
  if (orphan) throw new Error(`CORRECTION_REVIEW_EVENT_ORPHAN=${orphan.eventId}`);
  return receipts.map((receipt) => {
    const receiptEvents = events.filter((event) => event.receiptId === receipt.receiptId);
    let assignment: CorrectionReviewEvent | null = null;
    let decision: CorrectionReviewEvent | null = null;
    let outcome: CorrectionReviewEvent | null = null;
    let handoff: CorrectionReviewEvent | null = null;
    for (const event of receiptEvents) {
      if (event.kind === "ASSIGNED") {
        if (assignment || decision || outcome || handoff) throw new Error(`CORRECTION_REVIEW_TRANSITION_INVALID=${event.eventId}`);
        assignment = event;
      } else if (event.kind === "EVIDENCE_DECISION") {
        if (!assignment || decision || outcome || handoff || event.reviewerId !== assignment.reviewerId) {
          throw new Error(`CORRECTION_REVIEW_TRANSITION_INVALID=${event.eventId}`);
        }
        decision = event;
      } else if (event.kind === "OUTCOME_RECORDED") {
        if (!assignment || !decision || outcome || handoff || event.reviewerId !== assignment.reviewerId || event.decision !== decision.decision) {
          throw new Error(`CORRECTION_REVIEW_TRANSITION_INVALID=${event.eventId}`);
        }
        outcome = event;
      } else {
        if (
          !assignment
          || !decision
          || !outcome
          || handoff
          || decision.decision !== "APPROVED_FOR_MANUAL_HANDOFF"
          || outcome.decision !== "APPROVED_FOR_MANUAL_HANDOFF"
          || event.handoff?.candidateSha256 !== receipt.provenance.candidateSha256
        ) throw new Error(`CORRECTION_REVIEW_TRANSITION_INVALID=${event.eventId}`);
        handoff = event;
      }
    }
    if (decision && !outcome) throw new Error(`CORRECTION_REVIEW_OUTCOME_MISSING=${decision.eventId}`);
    const state: CorrectionReviewQueueItem["state"] = handoff ? "HANDED_OFF" : outcome?.decision || (assignment ? "ASSIGNED" : "PENDING_ASSIGNMENT");
    return {
      receipt,
      events: receiptEvents,
      assignedReviewerId: assignment?.reviewerId || null,
      state,
      canonicalReviewOperationId: handoff?.outcome.canonicalReviewOperationId || null
    };
  }).sort((left, right) => left.receipt.receivedAt.localeCompare(right.receipt.receivedAt));
}

export function buildCorrectionReviewQueueSnapshot(
  receiptsPath = correctionRequestInboxPath(),
  eventsPath = correctionReviewEventsPath()
): CorrectionReviewQueueSnapshot {
  const snapshot = buildCorrectionReviewQueueSnapshotInternal(receiptsPath, eventsPath);
  return { queue: snapshot.queue, reviewEventsSha256: snapshot.reviewEventsSha256 };
}

function buildCorrectionReviewQueueSnapshotInternal(
  receiptsPath = correctionRequestInboxPath(),
  eventsPath = correctionReviewEventsPath()
) {
  const reviewEvents = exactFileSnapshot(eventsPath);
  const receiptSnapshot = exactFileSnapshot(receiptsPath);
  const receipts = parseCorrectionRequestReceipts(receiptSnapshot.bytes);
  const events = validateCorrectionReviewEvents(parseJsonlBytes<CorrectionReviewEvent>(reviewEvents.bytes, "CORRECTION_REVIEW_EVENTS"));
  return {
    queue: buildCorrectionReviewQueueFrom(receipts, events),
    reviewEventsSha256: reviewEvents.sha256,
    receiptsSha256: receiptSnapshot.sha256
  };
}

export function buildCorrectionReviewQueue(
  receiptsPath = correctionRequestInboxPath(),
  eventsPath = correctionReviewEventsPath()
): CorrectionReviewQueueItem[] {
  return buildCorrectionReviewQueueSnapshot(receiptsPath, eventsPath).queue;
}

function noAutomaticOutcome(
  state: CorrectionReviewEvent["outcome"]["state"],
  canonicalReviewOperationId: string | null = null
): CorrectionReviewEvent["outcome"] {
  return {
    state,
    canonicalReviewOperationId,
    legalTruthChanged: false,
    storeTruthChanged: false,
    coordinateChanged: false,
    leafChanged: false,
    mapPositionChanged: false,
    rankingChanged: false
  };
}

function reviewEvent(
  input: Omit<CorrectionReviewEvent, "schemaVersion" | "eventId" | "localOnly" | "evidenceAccepted" | "outcome" | "handoff"> & {
    outcomeState: CorrectionReviewEvent["outcome"]["state"];
    handoff?: CorrectionReviewEvent["handoff"];
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
    outcome: noAutomaticOutcome(input.outcomeState, input.handoff?.targetOperationId || null),
    handoff: input.handoff || null
  };
}

function fsyncDirectory(directory: string) {
  const handle = fs.openSync(directory, "r");
  try {
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
}

function validateCommitGuards(guards: CorrectionReviewCommitGuard[]) {
  for (const guard of guards) {
    const current = exactFileSnapshot(guard.filePath);
    guard.validate(current.bytes);
    if (current.sha256 !== guard.expectedSha256) throw new Error(`${guard.staleLabel}=${current.sha256}`);
  }
}

function appendCorrectionReviewEvents(
  events: CorrectionReviewEvent[],
  expectedReviewEventsSha256: string,
  filePath = correctionReviewEventsPath(),
  commitGuards: CorrectionReviewCommitGuard[] = [],
  hooks: CorrectionReviewTransactionHooks = {}
) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lockPath = `${filePath}.lock`;
  const ownerToken = randomUUID();
  const stagedPath = `${filePath}.staged-${process.pid}-${ownerToken}`;
  const lockRecord: CorrectionReviewLockRecord = {
    schemaVersion: 1,
    ownerPid: process.pid,
    ownerToken,
    eventsPath: path.resolve(filePath),
    stagedPath: path.resolve(stagedPath)
  };
  const lockBytes = Buffer.from(`${JSON.stringify(lockRecord)}\n`, "utf8");
  let lockHandle: number | null = null;
  let stagedHandle: number | null = null;
  try {
    try {
      lockHandle = fs.openSync(lockPath, "wx", 0o600);
      fs.writeFileSync(lockHandle, lockBytes);
      fs.fsyncSync(lockHandle);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new Error("CORRECTION_REVIEW_EVENTS_LOCKED");
      }
      throw error;
    }

    // Lock order is fixed: review-events writer lock first; receipts and source registry remain exact-byte read guards.
    const current = exactFileSnapshot(filePath);
    if (current.sha256 !== expectedReviewEventsSha256) {
      throw new Error(`CORRECTION_REVIEW_EVENTS_STALE=${current.sha256}`);
    }
    validateCommitGuards(commitGuards);
    const suffix = Buffer.from(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");
    const next = Buffer.concat([current.bytes, suffix]);
    validateCorrectionReviewEvents(parseJsonlBytes<CorrectionReviewEvent>(next, "CORRECTION_REVIEW_EVENTS"));
    stagedHandle = fs.openSync(stagedPath, "wx", 0o600);
    fs.writeFileSync(stagedHandle, next);
    fs.fsyncSync(stagedHandle);
    fs.closeSync(stagedHandle);
    stagedHandle = null;

    hooks.beforeCommit?.();

    const immediatelyBeforeRename = exactFileSnapshot(filePath);
    if (!immediatelyBeforeRename.bytes.equals(current.bytes)) {
      throw new Error(`CORRECTION_REVIEW_EVENTS_STALE=${immediatelyBeforeRename.sha256}`);
    }
    validateCommitGuards(commitGuards);
    fs.renameSync(stagedPath, filePath);
    fsyncDirectory(path.dirname(filePath));
    return events;
  } finally {
    if (stagedHandle !== null) fs.closeSync(stagedHandle);
    if (fs.existsSync(stagedPath)) fs.unlinkSync(stagedPath);
    if (lockHandle !== null) {
      fs.closeSync(lockHandle);
      if (fs.existsSync(lockPath) && exactFileSnapshot(lockPath).bytes.equals(lockBytes)) {
        fs.unlinkSync(lockPath);
        fsyncDirectory(path.dirname(lockPath));
      }
    }
  }
}

function processIsAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw new Error(`CORRECTION_REVIEW_LOCK_OWNER_STATUS_UNCONFIRMED=${pid}`);
  }
}

export function recoverStaleCorrectionReviewArtifacts(input: {
  expectedLockSha256: string;
  expectedOwnerPid: number;
  expectedOwnerToken: string;
  eventsPath?: string;
}) {
  const eventsPath = path.resolve(input.eventsPath || correctionReviewEventsPath());
  const lockPath = `${eventsPath}.lock`;
  if (!fs.existsSync(lockPath)) throw new Error("CORRECTION_REVIEW_LOCK_NOT_FOUND");
  const expectedLockSha256 = normalizeExpectedSha256(input.expectedLockSha256, "CORRECTION_REVIEW_EXPECTED_LOCK_SHA256");
  const expectedOwnerToken = normalizeText(input.expectedOwnerToken, 180);
  if (!Number.isInteger(input.expectedOwnerPid) || input.expectedOwnerPid <= 0 || !expectedOwnerToken) {
    throw new Error("CORRECTION_REVIEW_LOCK_OWNER_REQUIRED");
  }
  const lock = exactFileSnapshot(lockPath);
  if (lock.sha256 !== expectedLockSha256) throw new Error(`CORRECTION_REVIEW_LOCK_STALE=${lock.sha256}`);
  let record: CorrectionReviewLockRecord;
  try {
    record = JSON.parse(lock.bytes.toString("utf8")) as CorrectionReviewLockRecord;
  } catch {
    throw new Error("CORRECTION_REVIEW_LOCK_INVALID");
  }
  const expectedStagedPath = `${eventsPath}.staged-${input.expectedOwnerPid}-${expectedOwnerToken}`;
  if (
    record.schemaVersion !== 1
    || record.ownerPid !== input.expectedOwnerPid
    || record.ownerToken !== expectedOwnerToken
    || path.resolve(record.eventsPath || "") !== eventsPath
    || path.resolve(record.stagedPath || "") !== expectedStagedPath
  ) throw new Error("CORRECTION_REVIEW_LOCK_OWNER_MISMATCH");
  if (processIsAlive(record.ownerPid)) throw new Error(`CORRECTION_REVIEW_LOCK_OWNER_ALIVE=${record.ownerPid}`);
  if (!exactFileSnapshot(lockPath).bytes.equals(lock.bytes)) throw new Error(`CORRECTION_REVIEW_LOCK_STALE=${exactFileSnapshot(lockPath).sha256}`);
  if (fs.existsSync(expectedStagedPath)) {
    const stat = fs.lstatSync(expectedStagedPath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("CORRECTION_REVIEW_STAGED_ARTIFACT_INVALID");
    fs.unlinkSync(expectedStagedPath);
  }
  if (!exactFileSnapshot(lockPath).bytes.equals(lock.bytes)) throw new Error(`CORRECTION_REVIEW_LOCK_STALE=${exactFileSnapshot(lockPath).sha256}`);
  fs.unlinkSync(lockPath);
  fsyncDirectory(path.dirname(lockPath));
  return { recovered: true as const, lockPath, stagedPath: expectedStagedPath };
}

function findQueueItem(receiptId: string, snapshot: CorrectionReviewQueueSnapshot) {
  const normalizedReceiptId = normalizeText(receiptId, 180);
  const item = snapshot.queue.find((candidate) => candidate.receipt.receiptId === normalizedReceiptId);
  if (!item) throw new Error(`CORRECTION_REVIEW_RECEIPT_NOT_FOUND=${normalizedReceiptId || "EMPTY"}`);
  return item;
}

export function assignCorrectionRequestReview(
  input: { receiptId: string; reviewerId: string; note?: string; expectedReviewEventsSha256: string },
  now = new Date(),
  receiptsPath = correctionRequestInboxPath(),
  eventsPath = correctionReviewEventsPath(),
  hooks: CorrectionReviewTransactionHooks = {}
) {
  const expectedReviewEventsSha256 = normalizeExpectedSha256(input.expectedReviewEventsSha256, "CORRECTION_REVIEW_EXPECTED_EVENTS_SHA256");
  const snapshot = buildCorrectionReviewQueueSnapshotInternal(receiptsPath, eventsPath);
  if (snapshot.reviewEventsSha256 !== expectedReviewEventsSha256) {
    throw new Error(`CORRECTION_REVIEW_EVENTS_STALE=${snapshot.reviewEventsSha256}`);
  }
  const item = findQueueItem(input.receiptId, snapshot);
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
  })], expectedReviewEventsSha256, eventsPath, [{
    filePath: receiptsPath,
    expectedSha256: snapshot.receiptsSha256,
    staleLabel: "CORRECTION_REVIEW_RECEIPTS_STALE",
    validate: parseCorrectionRequestReceipts
  }], hooks)[0];
}

export function decideCorrectionRequestReview(
  input: { receiptId: string; reviewerId: string; decision: CorrectionReviewDecision; note: string; expectedReviewEventsSha256: string },
  now = new Date(),
  receiptsPath = correctionRequestInboxPath(),
  eventsPath = correctionReviewEventsPath(),
  hooks: CorrectionReviewTransactionHooks = {}
) {
  const expectedReviewEventsSha256 = normalizeExpectedSha256(input.expectedReviewEventsSha256, "CORRECTION_REVIEW_EXPECTED_EVENTS_SHA256");
  const snapshot = buildCorrectionReviewQueueSnapshotInternal(receiptsPath, eventsPath);
  if (snapshot.reviewEventsSha256 !== expectedReviewEventsSha256) {
    throw new Error(`CORRECTION_REVIEW_EVENTS_STALE=${snapshot.reviewEventsSha256}`);
  }
  const item = findQueueItem(input.receiptId, snapshot);
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
  ], expectedReviewEventsSha256, eventsPath, [{
    filePath: receiptsPath,
    expectedSha256: snapshot.receiptsSha256,
    staleLabel: "CORRECTION_REVIEW_RECEIPTS_STALE",
    validate: parseCorrectionRequestReceipts
  }], hooks);
}

function parseSourceReviewRegistry(bytes: Buffer) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("CORRECTION_REVIEW_SOURCE_REGISTRY_INVALID");
  }
  try {
    return validateSourceReviewOperationsRegistry(parsed);
  } catch {
    throw new Error("CORRECTION_REVIEW_SOURCE_REGISTRY_INVALID");
  }
}

function sourceReviewRegistryIndex(registry: SourceReviewOperationsRegistry) {
  return {
    operationsById: new Map(registry.operations.map((operation) => [operation.operationId, operation])),
    resolvedOperationIds: new Set(registry.resolutions.map((resolution) => resolution.operationId))
  };
}

function requireHandoffTarget(registry: SourceReviewOperationsRegistry, targetOperationId: string, geo: string) {
  const index = sourceReviewRegistryIndex(registry);
  const target = index.operationsById.get(targetOperationId);
  if (!target) throw new Error(`CORRECTION_REVIEW_HANDOFF_TARGET_NOT_FOUND=${targetOperationId}`);
  if (target.geo !== geo) throw new Error(`CORRECTION_REVIEW_HANDOFF_GEO_MISMATCH=${geo}:${target.geo}`);
  if (index.resolvedOperationIds.has(targetOperationId)) {
    throw new Error(`CORRECTION_REVIEW_HANDOFF_TARGET_RESOLVED=${targetOperationId}`);
  }
  return target;
}

function readSourceReviewRegistrySnapshot(filePath: string) {
  const snapshot = exactFileSnapshot(filePath);
  return { registry: parseSourceReviewRegistry(snapshot.bytes), sha256: snapshot.sha256 };
}

export function recordCorrectionCanonicalHandoff(
  input: {
    receiptId: string;
    reviewerId: string;
    note: string;
    targetOperationId: string;
    expectedReviewEventsSha256: string;
    expectedSourceReviewRegistrySha256: string;
  },
  now = new Date(),
  receiptsPath = correctionRequestInboxPath(),
  eventsPath = correctionReviewEventsPath(),
  sourceRegistryPath = correctionSourceReviewRegistryPath(),
  hooks: CorrectionReviewTransactionHooks = {}
) {
  const expectedReviewEventsSha256 = normalizeExpectedSha256(input.expectedReviewEventsSha256, "CORRECTION_REVIEW_EXPECTED_EVENTS_SHA256");
  const expectedSourceReviewRegistrySha256 = normalizeExpectedSha256(input.expectedSourceReviewRegistrySha256, "CORRECTION_REVIEW_EXPECTED_SOURCE_REGISTRY_SHA256");
  const reviewerId = normalizeText(input.reviewerId, 120);
  const note = normalizeText(input.note, 2_000);
  const targetOperationId = normalizeText(input.targetOperationId, 180);
  if (!reviewerId) throw new Error("CORRECTION_REVIEW_REVIEWER_REQUIRED");
  if (!note) throw new Error("CORRECTION_REVIEW_HANDOFF_NOTE_REQUIRED");
  if (!targetOperationId) throw new Error("CORRECTION_REVIEW_HANDOFF_TARGET_REQUIRED");

  const snapshot = buildCorrectionReviewQueueSnapshotInternal(receiptsPath, eventsPath);
  const item = findQueueItem(input.receiptId, snapshot);
  const existing = item.events.find((event) => event.kind === "HANDOFF_RECORDED");
  if (existing) {
    const sameEvent = existing.reviewerId === reviewerId
      && existing.note === note
      && existing.handoff?.candidateSha256 === item.receipt.provenance.candidateSha256
      && existing.handoff?.targetOperationId === targetOperationId
      && existing.handoff?.sourceReviewRegistrySha256 === expectedSourceReviewRegistrySha256;
    if (!sameEvent) throw new Error(`CORRECTION_REVIEW_HANDOFF_CONFLICT=${item.receipt.receiptId}`);
    return existing;
  }
  if (snapshot.reviewEventsSha256 !== expectedReviewEventsSha256) {
    throw new Error(`CORRECTION_REVIEW_EVENTS_STALE=${snapshot.reviewEventsSha256}`);
  }
  if (item.state !== "APPROVED_FOR_MANUAL_HANDOFF") {
    throw new Error(`CORRECTION_REVIEW_HANDOFF_INVALID_STATE=${item.state}`);
  }
  if (reviewerId !== item.assignedReviewerId) throw new Error("CORRECTION_REVIEW_REVIEWER_MISMATCH");

  const source = readSourceReviewRegistrySnapshot(sourceRegistryPath);
  if (source.sha256 !== expectedSourceReviewRegistrySha256) {
    throw new Error(`CORRECTION_REVIEW_SOURCE_REGISTRY_STALE=${source.sha256}`);
  }
  requireHandoffTarget(source.registry, targetOperationId, item.receipt.candidate.geo);

  const event = reviewEvent({
    receiptId: item.receipt.receiptId,
    occurredAt: now.toISOString(),
    kind: "HANDOFF_RECORDED",
    reviewerId,
    decision: "APPROVED_FOR_MANUAL_HANDOFF",
    note,
    outcomeState: "HANDED_OFF",
    handoff: {
      candidateSha256: item.receipt.provenance.candidateSha256,
      targetOperationId,
      sourceReviewRegistrySha256: source.sha256
    }
  });
  return appendCorrectionReviewEvents([event], expectedReviewEventsSha256, eventsPath, [
    {
      filePath: receiptsPath,
      expectedSha256: snapshot.receiptsSha256,
      staleLabel: "CORRECTION_REVIEW_RECEIPTS_STALE",
      validate: parseCorrectionRequestReceipts
    },
    {
      filePath: sourceRegistryPath,
      expectedSha256: source.sha256,
      staleLabel: "CORRECTION_REVIEW_SOURCE_REGISTRY_STALE",
      validate: (bytes) => requireHandoffTarget(parseSourceReviewRegistry(bytes), targetOperationId, item.receipt.candidate.geo)
    }
  ], hooks)[0];
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
