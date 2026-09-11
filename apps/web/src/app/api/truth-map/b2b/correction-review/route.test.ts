import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { receiveCorrectionRequest } from "@/truth-map/correctionRequest";
import { GET, POST } from "./route";

const tempDirs: string[] = [];

afterEach(() => {
  delete process.env.ISLEGAL_B2B_CORRECTION_INBOX_PATH;
  delete process.env.ISLEGAL_B2B_CORRECTION_REVIEW_PATH;
  for (const directory of tempDirs.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function request(host: string, method = "GET", body?: unknown) {
  return new Request(`${host.startsWith("127") ? "http" : "https"}://${host}/api/truth-map/b2b/correction-review`, {
    method,
    headers: { host, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
}

describe("local correction review API", () => {
  it("runs the append-only assignment and decision lifecycle locally", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-correction-review-route-"));
    tempDirs.push(directory);
    process.env.ISLEGAL_B2B_CORRECTION_INBOX_PATH = path.join(directory, "requests.jsonl");
    process.env.ISLEGAL_B2B_CORRECTION_REVIEW_PATH = path.join(directory, "events.jsonl");
    const receipt = receiveCorrectionRequest({ geo: "MN", organization: "Submitter", sourceUrl: "https://example.gov/law", note: "Review this." });

    expect((await POST(request("127.0.0.1:3000", "POST", { action: "ASSIGN", receiptId: receipt.receiptId, reviewerId: "REVIEWER-API" }))).status).toBe(201);
    expect((await POST(request("127.0.0.1:3000", "POST", {
      action: "DECIDE",
      receiptId: receipt.receiptId,
      reviewerId: "REVIEWER-API",
      decision: "NEEDS_MORE_EVIDENCE",
      note: "The current candidate is insufficient."
    }))).status).toBe(201);
    const response = await GET(request("127.0.0.1:3000"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.queue).toEqual([expect.objectContaining({ state: "NEEDS_MORE_EVIDENCE", events: expect.arrayContaining([expect.objectContaining({ kind: "OUTCOME_RECORDED", evidenceAccepted: false })]) })]);
  });

  it("is production-404 and refuses a decision before assignment", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-correction-review-route-"));
    tempDirs.push(directory);
    process.env.ISLEGAL_B2B_CORRECTION_INBOX_PATH = path.join(directory, "requests.jsonl");
    process.env.ISLEGAL_B2B_CORRECTION_REVIEW_PATH = path.join(directory, "events.jsonl");
    const receipt = receiveCorrectionRequest({ geo: "MN", organization: "Submitter", sourceUrl: "https://example.gov/law", note: "Review this." });
    expect((await POST(request("127.0.0.1:3000", "POST", { action: "DECIDE", receiptId: receipt.receiptId, reviewerId: "R", decision: "REJECTED", note: "No." }))).status).toBe(400);
    expect((await GET(request("www.islegal.info"))).status).toBe(404);
  });
});

