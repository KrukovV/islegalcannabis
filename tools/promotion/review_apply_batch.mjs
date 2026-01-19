import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { normalizeSources } from "../../packages/shared/src/sources.js";
import { loadSourceRegistries } from "../sources/load_registries.mjs";

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    limit: 5,
    dir: "data/reviews",
    root: process.cwd()
  };
  for (const arg of args) {
    if (arg.startsWith("--limit=")) options.limit = Number(arg.split("=")[1]);
    if (arg.startsWith("--dir=")) options.dir = arg.split("=")[1];
    if (arg.startsWith("--root=")) options.root = arg.split("=")[1];
  }
  if (!options.limit || Number.isNaN(options.limit)) options.limit = 5;
  return options;
}

function resolveProfilePath(root, id) {
  const upper = id.toUpperCase();
  if (upper.startsWith("US-") && upper.length === 5) {
    const region = upper.slice(3);
    return path.join(root, "data", "laws", "us", `${region}.json`);
  }
  const euPath = path.join(root, "data", "laws", "eu", `${upper}.json`);
  if (fs.existsSync(euPath)) return euPath;
  return path.join(root, "data", "laws", "world", `${upper}.json`);
}

function profileStatusAllowsReview(profile) {
  const status = String(profile?.review_status || "").toLowerCase();
  if (status === "needs_review" || status === "reviewed_pending") return true;
  const history = Array.isArray(profile?.review_status_history)
    ? profile.review_status_history
    : [];
  return history.some((item) => String(item?.status || "").toLowerCase() === "reviewed_pending");
}

function loadFactsSchema(root) {
  const schemaPath = path.join(root, "data", "ssot", "facts_schema.json");
  if (!fs.existsSync(schemaPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  } catch {
    return {};
  }
}

function resolveReviewSources(review, profile) {
  if (Array.isArray(review.review_sources)) return review.review_sources;
  if (Array.isArray(review.sources)) return review.sources;
  if (Array.isArray(profile.review_sources)) return profile.review_sources;
  return [];
}

function hasRequiredFields(payload, requiredFields) {
  for (const field of requiredFields) {
    const value = payload?.[field];
    if (!value || String(value).toLowerCase() === "unknown") return false;
  }
  return true;
}

function hasEffectiveDate(payload, factsSchema) {
  const dateFields = Array.isArray(factsSchema?.date_fields)
    ? factsSchema.date_fields.map((field) => String(field))
    : [];
  if (!dateFields.includes("effective_date")) return true;
  return Boolean(String(payload?.effective_date || "").trim());
}

function hasVerifiedFacts(profile) {
  if (profile?.verified_official !== true) return false;
  const facts = Array.isArray(profile?.facts) ? profile.facts : [];
  const hasDate = facts.some((fact) => Boolean(fact?.effective_date));
  const hasCategory = facts.some((fact) => {
    const category = String(fact?.category || "").toLowerCase();
    return category === "medical" || category === "recreational" || category === "decriminalized";
  });
  return hasDate && hasCategory;
}

function resolveRejectReason(profile) {
  const notes = Array.isArray(profile?.review_notes) ? profile.review_notes : [];
  if (notes.some((note) => String(note).includes("missing official sources"))) {
    return "no_sources";
  }
  if (notes.some((note) => String(note).includes("missing effective_date"))) {
    return "schema_fail";
  }
  if (notes.some((note) => String(note).includes("missing required fields"))) {
    return "schema_fail";
  }
  return "schema_fail";
}

function main() {
  const { limit, dir, root } = parseArgs();
  const reviewsDir = path.isAbsolute(dir) ? dir : path.join(root, dir);
  if (!fs.existsSync(reviewsDir)) {
    console.error(`Missing reviews directory: ${reviewsDir}`);
    process.exit(1);
  }

  const registries = loadSourceRegistries(root);
  const factsSchema = loadFactsSchema(root);
  const requiredFields = Array.isArray(factsSchema?.required_fields)
    ? factsSchema.required_fields.map((field) => String(field))
    : ["medical", "recreational", "public_use", "cross_border"];

  const reviewFiles = fs
    .readdirSync(reviewsDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.join(reviewsDir, file))
    .sort((a, b) => a.localeCompare(b));

  const candidates = [];
  const rejected = [];
  for (const file of reviewFiles) {
    const review = JSON.parse(fs.readFileSync(file, "utf8"));
    const id = String(review.id || path.basename(file).split(".")[0]).toUpperCase();
    if (!id) continue;
    const profilePath = resolveProfilePath(root, id);
    if (!fs.existsSync(profilePath)) {
      rejected.push({ id, reason: "no_candidate" });
      continue;
    }
    const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
    if (!profileStatusAllowsReview(profile)) {
      rejected.push({ id, reason: "no_candidate" });
      continue;
    }
    const reviewSources = resolveReviewSources(review, profile);
    const normalizedSources = normalizeSources(reviewSources, registries);
    const officialCount = normalizedSources.official.length;
    if (officialCount === 0) {
      rejected.push({ id, reason: "no_sources" });
      continue;
    }
    if (!hasVerifiedFacts(profile)) {
      rejected.push({ id, reason: "schema_fail" });
      continue;
    }
    const nextPayload = { ...profile, ...(review.updates || {}) };
    if (!hasRequiredFields(nextPayload, requiredFields) || !hasEffectiveDate(nextPayload, factsSchema)) {
      rejected.push({ id, reason: "schema_fail" });
      continue;
    }
    candidates.push({ id, file, profilePath });
  }

  const toApply = candidates.slice(0, limit);
  const applied = [];

  for (const item of toApply) {
    const result = spawnSync(process.execPath, [
      path.join(process.cwd(), "tools", "promotion", "review_apply.mjs"),
      `--file=${item.file}`,
      `--root=${root}`
    ], { encoding: "utf8" });

    if (result.status !== 0) {
      rejected.push({ id: item.id, reason: "schema_fail" });
      continue;
    }

    const updated = JSON.parse(fs.readFileSync(item.profilePath, "utf8"));
    if (String(updated.review_status || "").toLowerCase() === "reviewed") {
      applied.push(item.id);
    } else {
      rejected.push({ id: item.id, reason: resolveRejectReason(updated) });
    }
  }

  const report = {
    at: new Date().toISOString(),
    applied,
    rejected
  };
  const reportDir = path.join(root, "Reports", "promotion");
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(
    path.join(reportDir, "last_batch.json"),
    JSON.stringify(report, null, 2) + "\n"
  );

  const appliedIds = applied.join(",") || "-";
  const rejectedReasons = rejected.map((entry) => entry.reason).join(",") || "-";
  process.stdout.write(
    "REVIEW_BATCH: " +
      `applied=${applied.length} ` +
      `rejected=${rejected.length} ` +
      `reasons=${rejectedReasons} ` +
      `ids=${appliedIds}`
  );
}

main();
