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
