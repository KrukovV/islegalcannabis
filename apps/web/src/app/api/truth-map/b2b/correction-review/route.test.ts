import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findRepoRoot } from "@/lib/ssotDiff/ssotSnapshotStore";
import { receiveCorrectionRequest } from "@/truth-map/correctionRequest";
import type { SourceReviewOperationsRegistry } from "@/truth-map/sourceReviewOperations";
import { GET, POST } from "./route";

const tempDirs: string[] = [];

afterEach(() => {
  delete process.env.ISLEGAL_B2B_CORRECTION_INBOX_PATH;
  delete process.env.ISLEGAL_B2B_CORRECTION_REVIEW_PATH;
  delete process.env.ISLEGAL_B2B_SOURCE_REVIEW_REGISTRY_PATH;
  for (const directory of tempDirs.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function request(host: string, method = "GET", body?: unknown) {
  return new Request(`${host.startsWith("127") ? "http" : "https"}://${host}/api/truth-map/b2b/correction-review`, {
    method,
    headers: { host, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
}

function sourceRegistryFixture(geo: string) {
  const canonical = JSON.parse(fs.readFileSync(
    path.join(findRepoRoot(process.cwd()), "data", "b2b_evidence", "source_review_operations.json"),
    "utf8"
  )) as SourceReviewOperationsRegistry;
  const operation = canonical.operations.find((entry) => entry.geo === geo && entry.sourceUrl.startsWith("https://"));
  if (!operation) throw new Error(`TEST_SOURCE_OPERATION_MISSING=${geo}`);
  return {
    registry: {
      ...canonical,
      operations: [operation],
      attempts: canonical.attempts.filter((attempt) => attempt.operationId === operation.operationId),
      resolutions: []
    },
    operationId: operation.operationId
  };
}

describe("local correction review API", () => {
  it("runs the CAS-bound assignment, decision and same-GEO handoff lifecycle locally", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-correction-review-route-"));
    tempDirs.push(directory);
    process.env.ISLEGAL_B2B_CORRECTION_INBOX_PATH = path.join(directory, "requests.jsonl");
    process.env.ISLEGAL_B2B_CORRECTION_REVIEW_PATH = path.join(directory, "events.jsonl");
    process.env.ISLEGAL_B2B_SOURCE_REVIEW_REGISTRY_PATH = path.join(directory, "source-review-operations.json");
    const sourceFixture = sourceRegistryFixture("MN");
    fs.writeFileSync(process.env.ISLEGAL_B2B_SOURCE_REVIEW_REGISTRY_PATH, JSON.stringify(sourceFixture.registry));
    const receipt = receiveCorrectionRequest({ geo: "MN", organization: "Submitter", sourceUrl: "https://example.gov/law", note: "Review this." });

    let current = await (await GET(request("127.0.0.1:3000"))).json();
    expect((await POST(request("127.0.0.1:3000", "POST", {
      action: "ASSIGN",
      receiptId: receipt.receiptId,
      reviewerId: "REVIEWER-API",
      expectedReviewEventsSha256: current.reviewEventsSha256
    }))).status).toBe(201);
    current = await (await GET(request("127.0.0.1:3000"))).json();
    expect((await POST(request("127.0.0.1:3000", "POST", {
      action: "DECIDE",
      receiptId: receipt.receiptId,
      reviewerId: "REVIEWER-API",
      decision: "APPROVED_FOR_MANUAL_HANDOFF",
      note: "The candidate may be handed to an existing canonical review operation.",
      expectedReviewEventsSha256: current.reviewEventsSha256
    }))).status).toBe(201);
    current = await (await GET(request("127.0.0.1:3000"))).json();
    const handoffResponse = await POST(request("127.0.0.1:3000", "POST", {
      action: "HANDOFF",
      receiptId: receipt.receiptId,
      reviewerId: "REVIEWER-API",
      targetOperationId: sourceFixture.operationId,
      note: "Bind this receipt to the existing same-GEO operation.",
      expectedReviewEventsSha256: current.reviewEventsSha256,
      expectedSourceReviewRegistrySha256: current.sourceReviewRegistrySha256
    }));
    expect(handoffResponse.status).toBe(201);
    const response = await GET(request("127.0.0.1:3000"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.queue).toEqual([expect.objectContaining({
      state: "HANDED_OFF",
      canonicalReviewOperationId: sourceFixture.operationId,
      events: expect.arrayContaining([expect.objectContaining({ kind: "HANDOFF_RECORDED", evidenceAccepted: false })])
    })]);
    expect(body.sourceReviewRegistrySha256).toBe(createHash("sha256").update(fs.readFileSync(process.env.ISLEGAL_B2B_SOURCE_REVIEW_REGISTRY_PATH)).digest("hex"));
  });

  it("is production-404 and refuses a decision before assignment", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-correction-review-route-"));
    tempDirs.push(directory);
    process.env.ISLEGAL_B2B_CORRECTION_INBOX_PATH = path.join(directory, "requests.jsonl");
    process.env.ISLEGAL_B2B_CORRECTION_REVIEW_PATH = path.join(directory, "events.jsonl");
    const receipt = receiveCorrectionRequest({ geo: "MN", organization: "Submitter", sourceUrl: "https://example.gov/law", note: "Review this." });
    const current = await (await GET(request("127.0.0.1:3000"))).json();
    expect((await POST(request("127.0.0.1:3000", "POST", {
      action: "DECIDE",
      receiptId: receipt.receiptId,
      reviewerId: "R",
      decision: "REJECTED",
      note: "No.",
      expectedReviewEventsSha256: current.reviewEventsSha256
    }))).status).toBe(400);
    expect((await GET(request("www.islegal.info"))).status).toBe(404);
  });

  it("rejects a stale review-events compare-and-swap token", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-correction-review-route-"));
    tempDirs.push(directory);
    process.env.ISLEGAL_B2B_CORRECTION_INBOX_PATH = path.join(directory, "requests.jsonl");
    process.env.ISLEGAL_B2B_CORRECTION_REVIEW_PATH = path.join(directory, "events.jsonl");
    const receipt = receiveCorrectionRequest({ geo: "MN", organization: "Submitter", sourceUrl: "https://example.gov/law", note: "Review this." });
    const current = await (await GET(request("127.0.0.1:3000"))).json();
    expect((await POST(request("127.0.0.1:3000", "POST", {
      action: "ASSIGN",
      receiptId: receipt.receiptId,
      reviewerId: "REVIEWER-API",
      expectedReviewEventsSha256: current.reviewEventsSha256
    }))).status).toBe(201);
    const stale = await POST(request("127.0.0.1:3000", "POST", {
      action: "DECIDE",
      receiptId: receipt.receiptId,
      reviewerId: "REVIEWER-API",
      decision: "REJECTED",
      note: "Reject.",
      expectedReviewEventsSha256: current.reviewEventsSha256
    }));
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual(expect.objectContaining({ error: expect.stringContaining("CORRECTION_REVIEW_EVENTS_STALE") }));

    const refreshed = await (await GET(request("127.0.0.1:3000"))).json();
    const lockPath = `${process.env.ISLEGAL_B2B_CORRECTION_REVIEW_PATH}.lock`;
    fs.writeFileSync(lockPath, "foreign-writer\n");
    const locked = await POST(request("127.0.0.1:3000", "POST", {
      action: "DECIDE",
      receiptId: receipt.receiptId,
      reviewerId: "REVIEWER-API",
      decision: "REJECTED",
      note: "Reject.",
      expectedReviewEventsSha256: refreshed.reviewEventsSha256
    }));
    expect(locked.status).toBe(409);
    expect(await locked.json()).toEqual({ error: "CORRECTION_REVIEW_EVENTS_LOCKED" });
    expect(fs.readFileSync(lockPath, "utf8")).toBe("foreign-writer\n");
  });
});
