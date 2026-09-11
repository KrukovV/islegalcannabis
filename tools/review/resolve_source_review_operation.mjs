#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_REGISTRY_PATH = path.join(ROOT, "data/b2b_evidence/source_review_operations.json");
const DEFAULT_OFFICIAL_REGISTRY_PATH = path.join(ROOT, "data/official/official_domains.ssot.json");
const DEFAULT_OWNERSHIP_PATH = path.join(ROOT, "data/ssot/official_link_ownership.json");
const OUTCOMES = new Set(["CONFIRMED_CURRENT", "SUPERSEDED"]);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function requiredText(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`SOURCE_REVIEW_RESOLUTION_${field}_REQUIRED`);
  return normalized;
}

function requiredHttpsUrl(value) {
  const normalized = requiredText(value, "EVIDENCE_URL");
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("SOURCE_REVIEW_RESOLUTION_EVIDENCE_URL_INVALID");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("SOURCE_REVIEW_RESOLUTION_EVIDENCE_URL_INVALID");
  }
  return parsed.toString();
}

function urlIdentity(value) {
  const parsed = new URL(value);
  const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return `${parsed.hostname.toLowerCase()}${pathname}${parsed.search}`;
}

function normalizedHost(value) {
  return String(value || "").trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

function hostMatches(host, registered) {
  const normalized = normalizedHost(registered);
  return Boolean(normalized) && (host === normalized || host.endsWith(`.${normalized}`));
}

function officialOwnerRegistryMatch(evidenceUrl, geo, officialRegistryPath, ownershipPath) {
  const host = normalizedHost(new URL(evidenceUrl).hostname);
  const registry = JSON.parse(fs.readFileSync(officialRegistryPath, "utf8"));
  const registered = (registry.domains || []).some((domain) => hostMatches(host, domain));
  if (!registered) return false;
  const ownership = JSON.parse(fs.readFileSync(ownershipPath, "utf8"));
  return (ownership.items || []).some((item) => (
    item.effective !== false
    && Array.isArray(item.owner_geos)
    && item.owner_geos.map((value) => String(value).trim().toUpperCase()).includes(geo)
    && hostMatches(host, item.domain || item.normalized_url || item.url)
  ));
}

function evidenceRelation({ evidenceUrl, operation, reviewedAttempt, officialRegistryPath, ownershipPath }) {
  const evidenceIdentity = urlIdentity(evidenceUrl);
  if (evidenceIdentity === urlIdentity(operation.sourceUrl)) return "RETAINED_SOURCE_URL";
  if (reviewedAttempt.finalUrl !== "NOT_RECORDED" && evidenceIdentity === urlIdentity(reviewedAttempt.finalUrl)) {
    return "REVALIDATED_FINAL_URL";
  }
  if (officialOwnerRegistryMatch(evidenceUrl, operation.geo, officialRegistryPath, ownershipPath)) {
    return "OFFICIAL_OWNER_REGISTRY";
  }
  throw new Error("SOURCE_REVIEW_RESOLUTION_EVIDENCE_NOT_LINKED_TO_OFFICIAL_OWNER");
}

function atomicWrite(filePath, payload) {
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
}

export function resolveSourceReviewOperation({
  registryPath = DEFAULT_REGISTRY_PATH,
  officialRegistryPath = DEFAULT_OFFICIAL_REGISTRY_PATH,
  ownershipPath = DEFAULT_OWNERSHIP_PATH,
  operationId,
  reviewerId,
  evidenceUrl,
  note,
  outcome,
  resolvedAt = new Date().toISOString(),
  resultingRevalidationState,
  resultingChangeReason,
  humanReviewed = false
} = {}) {
  if (humanReviewed !== true) throw new Error("SOURCE_REVIEW_RESOLUTION_EXPLICIT_HUMAN_REVIEW_REQUIRED");
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  if (registry.schemaVersion !== 4 || registry.localOnly !== true || registry.appendOnly !== true || !Array.isArray(registry.attempts)) {
    throw new Error("SOURCE_REVIEW_RESOLUTION_REGISTRY_INVALID");
  }
  const normalizedOperationId = requiredText(operationId, "OPERATION_ID");
  const operation = registry.operations.find((entry) => entry.operationId === normalizedOperationId);
  if (!operation) throw new Error(`SOURCE_REVIEW_RESOLUTION_OPERATION_NOT_FOUND=${normalizedOperationId}`);
  if (registry.resolutions.some((entry) => entry.operationId === normalizedOperationId)) {
    throw new Error(`SOURCE_REVIEW_RESOLUTION_ALREADY_RECORDED=${normalizedOperationId}`);
  }
  const attempts = registry.attempts
    .filter((entry) => entry.operationId === normalizedOperationId)
    .sort((left, right) => {
      const leftAt = Date.parse(left.attemptedAt);
      const rightAt = Date.parse(right.attemptedAt);
      return rightAt - leftAt || right.attemptId.localeCompare(left.attemptId);
    });
  const reviewedAttempt = attempts[0];
  if (!reviewedAttempt) throw new Error(`SOURCE_REVIEW_RESOLUTION_ATTEMPT_NOT_FOUND=${normalizedOperationId}`);
  const normalizedOutcome = requiredText(outcome, "OUTCOME");
  if (!OUTCOMES.has(normalizedOutcome)) throw new Error(`SOURCE_REVIEW_RESOLUTION_OUTCOME_INVALID=${normalizedOutcome}`);
  const normalizedResolvedAt = new Date(requiredText(resolvedAt, "RESOLVED_AT")).toISOString();
  if (Date.parse(normalizedResolvedAt) < Date.parse(operation.openedAt)) {
    throw new Error("SOURCE_REVIEW_RESOLUTION_DATE_BEFORE_OPEN");
  }
  const normalizedEvidenceUrl = requiredHttpsUrl(evidenceUrl);
  const normalizedEvidenceRelation = evidenceRelation({
    evidenceUrl: normalizedEvidenceUrl,
    operation,
    reviewedAttempt,
    officialRegistryPath,
    ownershipPath
  });
  const resolution = {
    resolutionId: `SRCRES-${sha256([
      normalizedOperationId,
      normalizedOutcome,
      normalizedResolvedAt,
      reviewerId,
      evidenceUrl
    ].join("\u0000")).slice(0, 24)}`,
    operationId: normalizedOperationId,
    geo: operation.geo,
    sourceUrl: operation.sourceUrl,
    resolvedAt: normalizedResolvedAt,
    outcome: normalizedOutcome,
    reviewerId: requiredText(reviewerId, "REVIEWER_ID"),
    evidenceUrl: normalizedEvidenceUrl,
    evidenceUrlRelation: normalizedEvidenceRelation,
    evidenceOwnerGeo: operation.geo,
    reviewedAttemptId: reviewedAttempt.attemptId,
    reviewedSignalIdentitySha256: reviewedAttempt.signalIdentitySha256,
    reviewedSourceCheckedAt: reviewedAttempt.sourceCheckedAt,
    note: requiredText(note, "NOTE"),
    resolutionBasis: "EXPLICIT_HUMAN_EVIDENCE_REVIEW",
    resultingRevalidationState: requiredText(resultingRevalidationState, "RESULTING_STATE"),
    resultingChangeReason: requiredText(resultingChangeReason, "RESULTING_REASON"),
    boundary: "SOURCE_REVIEW_RESOLUTION_ONLY_NO_LEGAL_CONCLUSION_CHANGE"
  };
  atomicWrite(registryPath, { ...registry, resolutions: [...registry.resolutions, resolution] });
  return resolution;
}

function arg(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function main() {
  const resolution = resolveSourceReviewOperation({
    operationId: arg("operation-id"),
    reviewerId: arg("reviewer-id"),
    evidenceUrl: arg("evidence-url"),
    note: arg("note"),
    outcome: arg("outcome"),
    resolvedAt: arg("resolved-at") || new Date().toISOString(),
    resultingRevalidationState: arg("resulting-state"),
    resultingChangeReason: arg("resulting-reason"),
    humanReviewed: process.argv.includes("--human-reviewed")
  });
  console.log(`SOURCE_REVIEW_RESOLUTION_ID=${resolution.resolutionId}`);
  console.log(`SOURCE_REVIEW_OPERATION_ID=${resolution.operationId}`);
  console.log("LEGAL_TRUTH_CHANGED=false");
  console.log("STORE_TRUTH_CHANGED=false");
  console.log("PRODUCTION_TOUCHED=false");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
