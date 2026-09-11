import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findRepoRoot } from "@/lib/ssotDiff/ssotSnapshotStore";
import { createCorrectionRequestReceipt, receiveCorrectionRequest } from "./correctionRequest";

const tempDirs: string[] = [];

function sha256File(filePath: string) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

afterEach(() => {
  delete process.env.ISLEGAL_B2B_CORRECTION_INBOX_PATH;
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
});
