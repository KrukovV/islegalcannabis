import fs from "node:fs";
import path from "node:path";
import { isLawKnown } from "../../packages/shared/src/law_known.js";
import { normalizeSources } from "../../packages/shared/src/sources.js";
import { sourcesMatchRegistry } from "../sources/registry_match.mjs";
import { loadSourceRegistries } from "../sources/load_registries.mjs";

function loadFactsSchema(root) {
  const schemaPath = path.join(root, "data", "ssot", "facts_schema.json");
  if (!fs.existsSync(schemaPath)) return { date_fields: [] };
  try {
    return JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  } catch {
    return { date_fields: [] };
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { file: "", root: process.cwd() };
  for (const arg of args) {
    if (arg.startsWith("--file=")) options.file = arg.split("=")[1];
    if (arg.startsWith("--root=")) options.root = arg.split("=")[1];
  }
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

function main() {
  const { file, root } = parseArgs();
  if (!file) {
    console.error("Missing --file for review_apply.");
    process.exit(1);
  }
  const reviewPath = path.isAbsolute(file) ? file : path.join(root, file);
  if (!fs.existsSync(reviewPath)) {
    console.error(`Missing review file: ${reviewPath}`);
    process.exit(1);
  }

  const review = JSON.parse(fs.readFileSync(reviewPath, "utf8"));
  const code = String(review.id || path.basename(reviewPath).split(".")[0]).toUpperCase();
  const target = resolveProfilePath(root, code);
  if (!fs.existsSync(target)) {
    console.error(`Missing profile: ${target}`);
    process.exit(1);
  }

  const parsed = JSON.parse(fs.readFileSync(target, "utf8"));
  if (parsed.review_status !== "needs_review") {
    console.error(`Profile not in needs_review: ${code}`);
    process.exit(1);
  }

  const updates = review.updates || {};
  const reviewSources = Array.isArray(review.review_sources)
    ? review.review_sources
    : Array.isArray(review.sources)
      ? review.sources
      : parsed.review_sources;
  const registries = loadSourceRegistries(root);
  const factsSchema = loadFactsSchema(root);
  const normalizedSources = normalizeSources(reviewSources, registries);
  const combinedSources = [
    ...normalizedSources.official,
    ...normalizedSources.neutral
  ];
  const officialCount = normalizedSources.official.length;
  const confidence = officialCount >= 2 ? "high" : officialCount === 1 ? "medium" : "low";
  const today = new Date().toISOString().slice(0, 10);
  const history = Array.isArray(parsed.review_status_history)
    ? parsed.review_status_history.slice()
    : [];

  const baseNext = {
    ...parsed,
    ...updates,
    review_sources: reviewSources,
    sources: combinedSources.length > 0 ? combinedSources : parsed.sources,
    updated_at: today
  };

  let next = baseNext;
  const registryMatch = sourcesMatchRegistry(code, next.sources);
  const hasOfficial = officialCount >= 1;
  const meetsRequiredFields = hasOfficial && isLawKnown(next, registries);
  const dateFields = Array.isArray(factsSchema.date_fields)
    ? factsSchema.date_fields.map((field) => String(field))
    : [];
  const requiresEffectiveDate = dateFields.includes("effective_date");
  const hasEffectiveDate = !requiresEffectiveDate
    || Boolean(String(next.effective_date || "").trim());
  if (!hasOfficial) {
    const notes = Array.isArray(parsed.review_notes) ? parsed.review_notes.slice() : [];
    notes.push("missing official sources");
    history.push({ status: parsed.review_status || "needs_review", at: parsed.updated_at || today });
    history.push({ status: "needs_review", at: today });
    next = {
      ...baseNext,
      status: "needs_review",
      review_status: "needs_review",
      review_confidence: confidence,
      review_notes: notes,
      review_status_history: history
    };
  } else if (!meetsRequiredFields) {
    const notes = Array.isArray(parsed.review_notes) ? parsed.review_notes.slice() : [];
    notes.push("missing required fields");
    history.push({ status: parsed.review_status || "needs_review", at: parsed.updated_at || today });
    history.push({ status: "needs_review", at: today });
    next = {
      ...baseNext,
      status: "needs_review",
      review_status: "needs_review",
      review_confidence: confidence,
      review_notes: notes,
      review_status_history: history
    };
  } else if (!hasEffectiveDate) {
    const notes = Array.isArray(parsed.review_notes) ? parsed.review_notes.slice() : [];
    notes.push("missing effective_date");
    history.push({ status: parsed.review_status || "needs_review", at: parsed.updated_at || today });
    history.push({ status: "needs_review", at: today });
    next = {
      ...baseNext,
      status: "needs_review",
      review_status: "needs_review",
      review_confidence: confidence,
      review_notes: notes,
      review_status_history: history
    };
  } else if (next.status === "known" && !registryMatch) {
    const notes = Array.isArray(parsed.review_notes) ? parsed.review_notes.slice() : [];
    notes.push("missing verified sources");
    history.push({ status: parsed.review_status || "needs_review", at: parsed.updated_at || today });
    history.push({ status: "needs_review", at: today });
    next = {
      ...baseNext,
      status: "needs_review",
      review_status: "needs_review",
      review_confidence: parsed.review_confidence || confidence,
      review_notes: notes,
      review_status_history: history
    };
  } else {
    history.push({ status: parsed.review_status || "needs_review", at: parsed.updated_at || today });
    history.push({ status: "reviewed", at: today });
    next = {
      ...baseNext,
      review_status: "reviewed",
      review_confidence: confidence,
      review_status_history: history
    };
  }

  fs.writeFileSync(target, JSON.stringify(next, null, 2) + "\n");
}

main();
