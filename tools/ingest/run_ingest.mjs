import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { readSchemaVersion } from "../lib/readSchemaVersion.mjs";

const ROOT = process.cwd();
const REGISTRY_PATH = path.join(ROOT, "data", "sources_registry.json");
const INBOX_DIR = path.join(ROOT, "data", "inbox");
const LAWS_DIR = path.join(ROOT, "data", "laws");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) {
    throw new Error("Missing data/sources_registry.json.");
  }
  const raw = fs.readFileSync(REGISTRY_PATH, "utf-8");
  return JSON.parse(raw);
}

function readInboxFile(filePath) {
  const fullPath = path.join(INBOX_DIR, filePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing inbox file: ${fullPath}`);
  }
  return fs.readFileSync(fullPath, "utf-8");
}

function extractProfile(entry, sourcesText) {
  if (entry.extracted_profile) {
    return entry.extracted_profile;
  }
  if (!sourcesText) return null;
  return null;
}

function scoreUrl(url) {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 0.4;
  }
  if (host.includes(".gov") || host.includes(".gouv.") || host.includes(".gob.")) {
    return 1.0;
  }
  return 0.4;
}

function computeConfidenceLocal({ extractedFields, requiredCount, sourcesUsed, consistency, freshnessHours }) {
  const trustSum = sourcesUsed.reduce((acc, source) => {
    return acc + scoreUrl(source.url) * source.weight;
  }, 0);
  const base = Math.min(2.0, trustSum);
  const coverage = requiredCount
    ? Math.min(1, extractedFields.length / requiredCount)
    : 0;
  let score = (base / 2) * 40 + coverage * 40;
  if (consistency && sourcesUsed.length >= 2) score += 10;
  if (freshnessHours > 12) score -= 15;
  if (freshnessHours > 48) score -= 10;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const officialCount = sourcesUsed.filter((source) => scoreUrl(source.url) >= 0.9).length;
  let confidence = "low";
  if (score >= 75 && officialCount >= 2) confidence = "high";
  else if (score >= 50) confidence = "medium";
  return { confidence, score };
}

function buildProvenance(modelId, inputHashes, citations) {
  return {
    method: "ocr+ai",
    extracted_at: new Date().toISOString().slice(0, 10),
    model_id: modelId,
    input_hashes: inputHashes,
    citations
  };
}

export function shouldSkipOverwrite(existingStatus) {
  return existingStatus === "known" || existingStatus === "needs_review";
}

function resolveProfilePath(profile) {
  const country = profile.country.toUpperCase();
  const region = profile.region ? profile.region.toUpperCase() : null;
  const dir = region ? path.join(LAWS_DIR, "us") : path.join(LAWS_DIR, "eu");
  const fileName = region ? `${region}.json` : `${country}.json`;
  return path.join(dir, fileName);
}

function writeProfile(profile) {
  const schemaVersion = readSchemaVersion();
  const filePath = resolveProfilePath(profile);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const body = JSON.stringify(
    { schema_version: schemaVersion, ...profile },
    null,
    2
  ) + "\n";
  fs.writeFileSync(filePath, body);
}

export async function runIngest() {
  const registry = readRegistry();
  const sources = Array.isArray(registry.sources)
    ? registry.sources
    : Array.isArray(registry.items)
      ? registry.items
      : [];
  if (sources.length === 0) {
    console.log("No sources to ingest.");
    return;
  }

  for (const entry of sources) {
    const inboxFiles = Array.isArray(entry.inbox_files) ? entry.inbox_files : [];
    const officialSources = entry.officialSources ?? [];
    const fallbackSources = entry.fallbackSources ?? [];
    const allSources = [...officialSources, ...fallbackSources];
    const hasOfflineInputs = inboxFiles.length > 0;
    if (allSources.length === 0 && !hasOfflineInputs) {
      console.log(`Skipping ${entry.jurisdictionKey}: no sources.`);
      continue;
    }

    const inputHashes = [];
    const citations = [];
    const cacheDir = path.join(INBOX_DIR, "cache", entry.jurisdictionKey);
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

    if (!hasOfflineInputs) {
      for (const source of allSources) {
        await sleep(1000);
        const response = await fetchWithTimeout(source.url, 5000);
        if (!response) continue;
        const ext = response.contentType.includes("pdf") ? "pdf" : "html";
        const hash = sha256(response.data);
        const filePath = path.join(cacheDir, `${hash}.${ext}`);
        fs.writeFileSync(filePath, response.data);
        inputHashes.push(hash);
        citations.push({
          url: source.url,
          snippet_hash: hash,
          retrieved_at: new Date().toISOString()
        });
      }
    } else {
      for (const filePath of inboxFiles) {
        const content = readInboxFile(filePath);
        inputHashes.push(sha256(content));
      }
      if (Array.isArray(entry.citations)) {
        citations.push(
          ...entry.citations.map((citation) => ({
            url: citation.url,
            title: citation.title ?? citation.url,
            snippet_hash: citation.snippet_hash,
            retrieved_at: citation.retrieved_at ?? new Date().toISOString()
          }))
        );
      }
    }

    const extracted = extractProfile(entry, "");
    if (!extracted) {
      console.log(`Skipping ${entry.jurisdictionKey}: no extracted profile.`);
      continue;
    }

    const requiredCount = 10;
    const extractedFields = Object.keys(extracted).filter((key) => Boolean(extracted[key]));
    const confidenceResult = computeConfidenceLocal({
      extractedFields,
      requiredCount,
      sourcesUsed: allSources.map((source) => ({
        url: source.url,
        weight: typeof source.weight === "number" ? source.weight : 1.0
      })),
      consistency: allSources.length >= 2,
      freshnessHours: 0
    });

    const profile = {
      ...extracted,
      status: "provisional",
      confidence: confidenceResult.confidence,
      provenance: buildProvenance(entry.model_id ?? "unknown", inputHashes, citations)
    };
    const targetPath = resolveProfilePath(profile);
    if (fs.existsSync(targetPath)) {
      const existing = JSON.parse(fs.readFileSync(targetPath, "utf-8"));
      if (shouldSkipOverwrite(existing.status)) {
        console.log(`SKIP overwrite ${profile.id} status=${existing.status}.`);
        continue;
      }
    }
    writeProfile(profile);
    console.log(`Wrote provisional profile for ${profile.id}.`);
  }
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  runIngest().catch((error) => {
    console.error(error.message || String(error));
    process.exit(1);
  });
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    const data = Buffer.from(await res.arrayBuffer());
    return { contentType, data };
  } finally {
    clearTimeout(timeout);
  }
}
