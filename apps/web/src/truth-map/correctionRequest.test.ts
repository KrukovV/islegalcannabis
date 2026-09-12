import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findRepoRoot } from "@/lib/ssotDiff/ssotSnapshotStore";
import {
  assignCorrectionRequestReview,
  buildCorrectionReviewQueue,
  buildCorrectionReviewQueueSnapshot,
  createCorrectionRequestReceipt,
  decideCorrectionRequestReview,
  readCorrectionRequestReceipts,
  recoverStaleCorrectionReviewArtifacts,
  recordCorrectionCanonicalHandoff,
  receiveCorrectionRequest
} from "./correctionRequest";
import type { SourceReviewOperationsRegistry } from "./sourceReviewOperations";

const tempDirs: string[] = [];

function sha256File(filePath: string) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function sha256Text(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function sourceRegistryFixture(geos: string[], resolvedGeos: string[] = []) {
  const root = findRepoRoot(process.cwd());
  const canonical = JSON.parse(fs.readFileSync(
    path.join(root, "data", "b2b_evidence", "source_review_operations.json"),
    "utf8"
  )) as SourceReviewOperationsRegistry;
  const operations = geos.map((geo) => {
    const operation = canonical.operations.find((entry) => entry.geo === geo && entry.sourceUrl.startsWith("https://"));
    if (!operation) throw new Error(`TEST_SOURCE_OPERATION_MISSING=${geo}`);
    return operation;
  });
  const operationIds = new Set(operations.map((operation) => operation.operationId));
  const attempts = canonical.attempts.filter((attempt) => operationIds.has(attempt.operationId));
  const resolutions = operations.filter((operation) => resolvedGeos.includes(operation.geo)).map((operation) => {
    const reviewedAttempt = attempts.filter((attempt) => attempt.operationId === operation.operationId)
      .sort((left, right) => left.attemptedAt.localeCompare(right.attemptedAt) || left.attemptId.localeCompare(right.attemptId)).at(-1);
    if (!reviewedAttempt) throw new Error(`TEST_SOURCE_ATTEMPT_MISSING=${operation.operationId}`);
    return {
      resolutionId: `TEST-RESOLUTION-${operation.operationId}`,
      operationId: operation.operationId,
      geo: operation.geo,
      sourceUrl: operation.sourceUrl,
      resolvedAt: "2099-01-01T00:00:00.000Z",
      outcome: "CONFIRMED_CURRENT" as const,
      reviewerId: "TEST-REVIEWER",
      evidenceUrl: operation.sourceUrl,
      evidenceUrlRelation: "RETAINED_SOURCE_URL" as const,
      evidenceOwnerGeo: operation.geo,
      reviewedAttemptId: reviewedAttempt.attemptId,
      reviewedSignalIdentitySha256: reviewedAttempt.signalIdentitySha256,
      reviewedSourceCheckedAt: reviewedAttempt.sourceCheckedAt,
      reviewRegistrySha256: "0".repeat(64),
      note: "Controlled fixture resolution.",
      resolutionBasis: "EXPLICIT_HUMAN_EVIDENCE_REVIEW" as const,
      resultingRevalidationState: reviewedAttempt.revalidationState,
      resultingChangeReason: reviewedAttempt.changeReason,
      boundary: "SOURCE_REVIEW_RESOLUTION_ONLY_NO_LEGAL_CONCLUSION_CHANGE" as const
    };
  });
  return {
    registry: { ...canonical, operations, attempts, resolutions },
    operationIdByGeo: new Map(operations.map((operation) => [operation.geo, operation.operationId]))
  };
}

function absentPid() {
  for (let pid = 999_999; pid > 900_000; pid -= 1) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return pid;
    }
  }
  throw new Error("TEST_ABSENT_PID_NOT_FOUND");
}

afterEach(() => {
  delete process.env.ISLEGAL_B2B_CORRECTION_INBOX_PATH;
  delete process.env.ISLEGAL_B2B_CORRECTION_REVIEW_PATH;
  delete process.env.ISLEGAL_B2B_SOURCE_REVIEW_REGISTRY_PATH;
  for (const directory of tempDirs.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("Correction request", () => {
  it("retains a submission only as an untrusted pending candidate without mutating truth or store inputs", () => {
    const root = findRepoRoot(process.cwd());
    const protectedFiles = [
      "data/reviews/wiki-truth-307-final-reconciliation.json",
      "data/store_truth/canonical_store_records.json",
      "data/store_truth/store_eligibility_model.json"
    ].map((relativePath) => path.join(root, relativePath));
    const before = protectedFiles.map(sha256File);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-correction-"));
    tempDirs.push(tempDir);
    const inbox = path.join(tempDir, "requests.jsonl");
    process.env.ISLEGAL_B2B_CORRECTION_INBOX_PATH = inbox;
    const receipt = receiveCorrectionRequest({
      geo: "mn",
      organization: "Example regulated business",
      sourceUrl: "https://example.gov/licence/123",
      licenceReference: "LIC-123",
      note: "Please independently verify this official licence record."
    }, new Date("2026-09-11T10:00:00.000Z"));
    expect(receipt.provenance.classification).toBe("SELF_SUBMITTED_UNTRUSTED_CANDIDATE");
    expect(receipt.review).toEqual({ state: "PENDING_INDEPENDENT_REVIEW", evidenceAccepted: false });
    expect(Object.values(receipt.outcome).filter((value) => typeof value === "boolean")).toEqual([false, false, false, false, false, false]);
    expect(fs.readFileSync(inbox, "utf8").trim()).toBe(JSON.stringify(receipt));
    expect(protectedFiles.map(sha256File)).toEqual(before);
  });

  it("rejects a noncanonical GEO or non-HTTPS evidence before a receipt exists", () => {
    expect(() => createCorrectionRequestReceipt({ geo: "NOT-A-GEO", organization: "Org", sourceUrl: "https://example.gov", note: "Evidence" }))
      .toThrow("CORRECTION_REQUEST_UNKNOWN_GEO=NOT-A-GEO");
    expect(() => createCorrectionRequestReceipt({ geo: "MN", organization: "Org", sourceUrl: "http://example.gov", note: "Evidence" }))
      .toThrow("CORRECTION_REQUEST_SOURCE_URL_INVALID");
  });

  it("records receipt, assignment, evidence decision and outcome without mutating protected truth inputs", () => {
    const root = findRepoRoot(process.cwd());
    const protectedFiles = [
      "data/reviews/wiki-truth-307-final-reconciliation.json",
      "data/store_truth/canonical_store_records.json",
      "data/store_truth/store_eligibility_model.json"
    ].map((relativePath) => path.join(root, relativePath));
    const before = protectedFiles.map(sha256File);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-correction-review-"));
    tempDirs.push(tempDir);
    const inbox = path.join(tempDir, "requests.jsonl");
    const events = path.join(tempDir, "review-events.jsonl");
    const sourceRegistry = path.join(tempDir, "source-review-operations.json");
    process.env.ISLEGAL_B2B_CORRECTION_INBOX_PATH = inbox;
    process.env.ISLEGAL_B2B_CORRECTION_REVIEW_PATH = events;
    process.env.ISLEGAL_B2B_SOURCE_REVIEW_REGISTRY_PATH = sourceRegistry;
    const sourceFixture = sourceRegistryFixture(["AD"]);
    const targetOperationId = sourceFixture.operationIdByGeo.get("AD")!;
    fs.writeFileSync(sourceRegistry, JSON.stringify(sourceFixture.registry));
    const receipt = receiveCorrectionRequest({
      geo: "AD",
      organization: "Example evidence submitter",
      sourceUrl: "https://example.gov/official-record",
      note: "Review the official record independently."
    }, new Date("2026-09-11T18:00:00.000Z"));

    assignCorrectionRequestReview({
      receiptId: receipt.receiptId,
      reviewerId: "REVIEWER-1",
      note: "Assigned for independent review.",
      expectedReviewEventsSha256: buildCorrectionReviewQueueSnapshot().reviewEventsSha256
    }, new Date("2026-09-11T18:01:00.000Z"));
    const decisionEvents = decideCorrectionRequestReview({
      receiptId: receipt.receiptId,
      reviewerId: "REVIEWER-1",
      decision: "APPROVED_FOR_MANUAL_HANDOFF",
      note: "Identity is sufficient to request a separate manual handoff; no canonical operation or conclusion is accepted here.",
      expectedReviewEventsSha256: buildCorrectionReviewQueueSnapshot().reviewEventsSha256
    }, new Date("2026-09-11T18:02:00.000Z"));
    const sourceRegistrySha256 = sha256File(sourceRegistry);
    const handoffInput = {
      receiptId: receipt.receiptId,
      reviewerId: "REVIEWER-1",
      targetOperationId,
      note: "Forward the candidate to this existing same-GEO canonical review operation.",
      expectedReviewEventsSha256: buildCorrectionReviewQueueSnapshot().reviewEventsSha256,
      expectedSourceReviewRegistrySha256: sourceRegistrySha256
    };
    const handoff = recordCorrectionCanonicalHandoff(handoffInput, new Date("2026-09-11T18:03:00.000Z"));
    const handoffBytes = fs.readFileSync(events);
    fs.appendFileSync(sourceRegistry, "\n");
    const idempotentHandoff = recordCorrectionCanonicalHandoff(handoffInput, new Date("2026-09-11T18:04:00.000Z"));
    expect(() => recordCorrectionCanonicalHandoff({ ...handoffInput, note: "A conflicting retry." }))
      .toThrow(`CORRECTION_REVIEW_HANDOFF_CONFLICT=${receipt.receiptId}`);
    const queue = buildCorrectionReviewQueue();

    expect(decisionEvents.map((event) => event.kind)).toEqual(["EVIDENCE_DECISION", "OUTCOME_RECORDED"]);
    expect(queue).toHaveLength(1);
    expect(handoff.kind).toBe("HANDOFF_RECORDED");
    expect(handoff.reviewerId).toBe("REVIEWER-1");
    expect(handoff.occurredAt).toBe("2026-09-11T18:03:00.000Z");
    expect(handoff.handoff).toEqual({
      candidateSha256: receipt.provenance.candidateSha256,
      targetOperationId,
      sourceReviewRegistrySha256: sourceRegistrySha256
    });
    expect(idempotentHandoff).toEqual(handoff);
    expect(fs.readFileSync(events)).toEqual(handoffBytes);
    expect(queue[0].state).toBe("HANDED_OFF");
    expect(queue[0].canonicalReviewOperationId).toBe(targetOperationId);
    expect(queue[0].events).toHaveLength(4);
    expect(queue[0].events.every((event) => event.evidenceAccepted === false)).toBe(true);
    expect(queue[0].events.at(-1)?.outcome).toEqual(expect.objectContaining({
      state: "HANDED_OFF",
      canonicalReviewOperationId: targetOperationId
    }));
    expect(queue[0].events.every((event) => Object.values(event.outcome).filter((value) => typeof value === "boolean").every((value) => value === false))).toBe(true);
    expect(protectedFiles.map(sha256File)).toEqual(before);

    const eventLines = fs.readFileSync(events, "utf8").trim().split("\n");
    fs.writeFileSync(events, `${[eventLines[1], eventLines[0], eventLines[2], eventLines[3]].join("\n")}\n`);
    expect(() => buildCorrectionReviewQueue()).toThrow("CORRECTION_REVIEW_TRANSITION_INVALID");
  });

  it("rejects a tampered candidate and stale review-event compare-and-swap", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-correction-integrity-"));
    tempDirs.push(tempDir);
    const inbox = path.join(tempDir, "requests.jsonl");
    const events = path.join(tempDir, "review-events.jsonl");
    process.env.ISLEGAL_B2B_CORRECTION_INBOX_PATH = inbox;
    process.env.ISLEGAL_B2B_CORRECTION_REVIEW_PATH = events;
    const receipt = receiveCorrectionRequest({ geo: "MN", organization: "Submitter", sourceUrl: "https://example.gov/law", note: "Review this." });
    const emptyEventsSha256 = sha256Text(Buffer.alloc(0));
    assignCorrectionRequestReview({ receiptId: receipt.receiptId, reviewerId: "REVIEWER-1", expectedReviewEventsSha256: emptyEventsSha256 });
    const beforeStaleRetry = fs.readFileSync(events);
    expect(() => assignCorrectionRequestReview({ receiptId: receipt.receiptId, reviewerId: "REVIEWER-2", expectedReviewEventsSha256: emptyEventsSha256 }))
      .toThrow("CORRECTION_REVIEW_EVENTS_STALE");
    expect(fs.readFileSync(events)).toEqual(beforeStaleRetry);

    const tampered = JSON.parse(fs.readFileSync(inbox, "utf8")) as { candidate: { note: string } };
    tampered.candidate.note = "Tampered after receipt.";
    fs.writeFileSync(inbox, `${JSON.stringify(tampered)}\n`);
    expect(() => readCorrectionRequestReceipts()).toThrow("CORRECTION_REQUEST_CANDIDATE_SHA256_MISMATCH");
  });

  it("fails closed when the receipt registry changes after staging and before commit", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-correction-receipt-race-"));
    tempDirs.push(tempDir);
    const inbox = path.join(tempDir, "requests.jsonl");
    const events = path.join(tempDir, "review-events.jsonl");
    process.env.ISLEGAL_B2B_CORRECTION_INBOX_PATH = inbox;
    process.env.ISLEGAL_B2B_CORRECTION_REVIEW_PATH = events;
    const receipt = receiveCorrectionRequest({ geo: "MN", organization: "Submitter", sourceUrl: "https://example.gov/law", note: "Review this." });
    expect(() => assignCorrectionRequestReview({
      receiptId: receipt.receiptId,
      reviewerId: "REVIEWER-1",
      expectedReviewEventsSha256: sha256Text(Buffer.alloc(0))
    }, new Date("2026-09-12T03:00:00.000Z"), inbox, events, {
      beforeCommit: () => fs.appendFileSync(inbox, `${JSON.stringify(createCorrectionRequestReceipt({
        geo: "AD",
        organization: "Concurrent submitter",
        sourceUrl: "https://example.gov/concurrent",
        note: "A valid concurrent receipt."
      }, new Date("2026-09-12T03:00:01.000Z")))}\n`)
    })).toThrow("CORRECTION_REVIEW_RECEIPTS_STALE");
    expect(fs.existsSync(events)).toBe(false);
    expect(fs.existsSync(`${events}.lock`)).toBe(false);
    expect(fs.readdirSync(tempDir).some((entry) => entry.startsWith("review-events.jsonl.staged-"))).toBe(false);
  });

  it("preserves a foreign review-events lock and refuses a concurrent append", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-correction-lock-"));
    tempDirs.push(tempDir);
    const inbox = path.join(tempDir, "requests.jsonl");
    const events = path.join(tempDir, "review-events.jsonl");
    const lock = `${events}.lock`;
    process.env.ISLEGAL_B2B_CORRECTION_INBOX_PATH = inbox;
    process.env.ISLEGAL_B2B_CORRECTION_REVIEW_PATH = events;
    const receipt = receiveCorrectionRequest({ geo: "MN", organization: "Submitter", sourceUrl: "https://example.gov/law", note: "Review this." });
    fs.writeFileSync(lock, "another-writer\n");
    expect(() => assignCorrectionRequestReview({
      receiptId: receipt.receiptId,
      reviewerId: "REVIEWER-1",
      expectedReviewEventsSha256: sha256Text(Buffer.alloc(0))
    })).toThrow("CORRECTION_REVIEW_EVENTS_LOCKED");
    expect(fs.readFileSync(lock, "utf8")).toBe("another-writer\n");
    expect(fs.existsSync(events)).toBe(false);
  });

  it("recovers only an exact stale owner lock and its exact staged file", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-correction-recovery-"));
    tempDirs.push(tempDir);
    const events = path.join(tempDir, "review-events.jsonl");
    const lock = `${events}.lock`;
    const ownerPid = absentPid();
    const ownerToken = "controlled-stale-owner";
    const staged = `${events}.staged-${ownerPid}-${ownerToken}`;
    const lockBytes = Buffer.from(`${JSON.stringify({
      schemaVersion: 1,
      ownerPid,
      ownerToken,
      eventsPath: path.resolve(events),
      stagedPath: path.resolve(staged)
    })}\n`);
    fs.writeFileSync(staged, "staged event bytes");
    fs.writeFileSync(lock, lockBytes);

    expect(() => recoverStaleCorrectionReviewArtifacts({
      eventsPath: events,
      expectedLockSha256: sha256Text(lockBytes),
      expectedOwnerPid: ownerPid,
      expectedOwnerToken: "foreign-owner"
    })).toThrow("CORRECTION_REVIEW_LOCK_OWNER_MISMATCH");
    expect(fs.readFileSync(lock)).toEqual(lockBytes);
    expect(fs.readFileSync(staged, "utf8")).toBe("staged event bytes");

    expect(recoverStaleCorrectionReviewArtifacts({
      eventsPath: events,
      expectedLockSha256: sha256Text(lockBytes),
      expectedOwnerPid: ownerPid,
      expectedOwnerToken: ownerToken
    })).toEqual({ recovered: true, lockPath: lock, stagedPath: staged });
    expect(fs.existsSync(lock)).toBe(false);
    expect(fs.existsSync(staged)).toBe(false);
  });

  it("rejects missing, cross-GEO and stale source-review handoff targets without appending", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-correction-handoff-negative-"));
    tempDirs.push(tempDir);
    const inbox = path.join(tempDir, "requests.jsonl");
    const events = path.join(tempDir, "review-events.jsonl");
    const sourceRegistry = path.join(tempDir, "source-review-operations.json");
    process.env.ISLEGAL_B2B_CORRECTION_INBOX_PATH = inbox;
    process.env.ISLEGAL_B2B_CORRECTION_REVIEW_PATH = events;
    process.env.ISLEGAL_B2B_SOURCE_REVIEW_REGISTRY_PATH = sourceRegistry;
    const sourceFixture = sourceRegistryFixture(["AD", "MN"]);
    const crossGeoOperationId = sourceFixture.operationIdByGeo.get("AD")!;
    const sameGeoOperationId = sourceFixture.operationIdByGeo.get("MN")!;
    fs.writeFileSync(sourceRegistry, JSON.stringify(sourceFixture.registry));
    const receipt = receiveCorrectionRequest({ geo: "MN", organization: "Submitter", sourceUrl: "https://example.gov/law", note: "Review this." });
    assignCorrectionRequestReview({ receiptId: receipt.receiptId, reviewerId: "REVIEWER-1", expectedReviewEventsSha256: sha256Text(Buffer.alloc(0)) });
    const beforeApproval = fs.readFileSync(events);
    expect(() => recordCorrectionCanonicalHandoff({
      receiptId: receipt.receiptId,
      reviewerId: "REVIEWER-1",
      note: "This must not be accepted before approval.",
      targetOperationId: crossGeoOperationId,
      expectedReviewEventsSha256: buildCorrectionReviewQueueSnapshot().reviewEventsSha256,
      expectedSourceReviewRegistrySha256: sha256File(sourceRegistry)
    })).toThrow("CORRECTION_REVIEW_HANDOFF_INVALID_STATE=ASSIGNED");
    expect(fs.readFileSync(events)).toEqual(beforeApproval);
    decideCorrectionRequestReview({
      receiptId: receipt.receiptId,
      reviewerId: "REVIEWER-1",
      decision: "APPROVED_FOR_MANUAL_HANDOFF",
      note: "Ready only for a separately verified handoff.",
      expectedReviewEventsSha256: buildCorrectionReviewQueueSnapshot().reviewEventsSha256
    });
    const expectedReviewEventsSha256 = buildCorrectionReviewQueueSnapshot().reviewEventsSha256;
    const expectedSourceReviewRegistrySha256 = sha256File(sourceRegistry);
    const before = fs.readFileSync(events);
    const base = {
      receiptId: receipt.receiptId,
      reviewerId: "REVIEWER-1",
      note: "Bind to an existing same-GEO operation.",
      expectedReviewEventsSha256,
      expectedSourceReviewRegistrySha256
    };
    expect(() => recordCorrectionCanonicalHandoff({ ...base, targetOperationId: "SRCREV-MISSING" }))
      .toThrow("CORRECTION_REVIEW_HANDOFF_TARGET_NOT_FOUND");
    expect(() => recordCorrectionCanonicalHandoff({ ...base, targetOperationId: crossGeoOperationId }))
      .toThrow("CORRECTION_REVIEW_HANDOFF_GEO_MISMATCH");
    expect(() => recordCorrectionCanonicalHandoff({ ...base, targetOperationId: crossGeoOperationId, expectedSourceReviewRegistrySha256: sha256Text("stale") }))
      .toThrow("CORRECTION_REVIEW_SOURCE_REGISTRY_STALE");
    const resolvedFixture = sourceRegistryFixture(["AD", "MN"], ["MN"]);
    fs.writeFileSync(sourceRegistry, JSON.stringify(resolvedFixture.registry));
    expect(() => recordCorrectionCanonicalHandoff({
      ...base,
      targetOperationId: sameGeoOperationId,
      expectedSourceReviewRegistrySha256: sha256File(sourceRegistry)
    })).toThrow("CORRECTION_REVIEW_HANDOFF_TARGET_RESOLVED");
    fs.writeFileSync(sourceRegistry, JSON.stringify({ ...sourceFixture.registry, schemaVersion: 4 }));
    expect(() => recordCorrectionCanonicalHandoff({
      ...base,
      targetOperationId: sameGeoOperationId,
      expectedSourceReviewRegistrySha256: sha256File(sourceRegistry)
    })).toThrow("CORRECTION_REVIEW_SOURCE_REGISTRY_INVALID");
    expect(fs.readFileSync(events)).toEqual(before);
  });

  it("fails closed when the canonical source registry changes after staging and before handoff commit", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-correction-source-race-"));
    tempDirs.push(tempDir);
    const inbox = path.join(tempDir, "requests.jsonl");
    const events = path.join(tempDir, "review-events.jsonl");
    const sourceRegistry = path.join(tempDir, "source-review-operations.json");
    process.env.ISLEGAL_B2B_CORRECTION_INBOX_PATH = inbox;
    process.env.ISLEGAL_B2B_CORRECTION_REVIEW_PATH = events;
    process.env.ISLEGAL_B2B_SOURCE_REVIEW_REGISTRY_PATH = sourceRegistry;
    const sourceFixture = sourceRegistryFixture(["MN"]);
    const targetOperationId = sourceFixture.operationIdByGeo.get("MN")!;
    fs.writeFileSync(sourceRegistry, JSON.stringify(sourceFixture.registry));
    const receipt = receiveCorrectionRequest({ geo: "MN", organization: "Submitter", sourceUrl: "https://example.gov/law", note: "Review this." });
    assignCorrectionRequestReview({
      receiptId: receipt.receiptId,
      reviewerId: "REVIEWER-1",
      expectedReviewEventsSha256: sha256Text(Buffer.alloc(0))
    });
    decideCorrectionRequestReview({
      receiptId: receipt.receiptId,
      reviewerId: "REVIEWER-1",
      decision: "APPROVED_FOR_MANUAL_HANDOFF",
      note: "Approved only for an exact canonical handoff.",
      expectedReviewEventsSha256: buildCorrectionReviewQueueSnapshot().reviewEventsSha256
    });
    const before = fs.readFileSync(events);
    expect(() => recordCorrectionCanonicalHandoff({
      receiptId: receipt.receiptId,
      reviewerId: "REVIEWER-1",
      note: "Bind to the current unresolved same-GEO operation.",
      targetOperationId,
      expectedReviewEventsSha256: buildCorrectionReviewQueueSnapshot().reviewEventsSha256,
      expectedSourceReviewRegistrySha256: sha256File(sourceRegistry)
    }, new Date("2026-09-12T03:30:00.000Z"), inbox, events, sourceRegistry, {
      beforeCommit: () => fs.appendFileSync(sourceRegistry, "\n")
    })).toThrow("CORRECTION_REVIEW_SOURCE_REGISTRY_STALE");
    expect(fs.readFileSync(events)).toEqual(before);
    expect(fs.existsSync(`${events}.lock`)).toBe(false);
    expect(fs.readdirSync(tempDir).some((entry) => entry.startsWith("review-events.jsonl.staged-"))).toBe(false);
  });
});
