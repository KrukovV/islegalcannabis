#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OFFICIAL_PATH = path.join(ROOT, "data", "official", "official_domains.ssot.json");

function normalizeDomain(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return "";
  let cleaned = value.replace(/^https?:\/\//i, "");
  cleaned = cleaned.replace(/^\/+/, "");
  cleaned = cleaned.split(/[/?#]/)[0] || "";
  cleaned = cleaned.trim();
  return cleaned;
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`SSOT parse error: ${filePath}: ${message}`);
  }
}

export function readOfficialDomainsSSOT() {
  if (!fs.existsSync(OFFICIAL_PATH)) {
    throw new Error(`SSOT missing: ${OFFICIAL_PATH}`);
  }
  const payload = readJson(OFFICIAL_PATH);
  if (!payload || !Array.isArray(payload.domains)) {
    throw new Error("SSOT format error: expected {domains:[...]} in official_domains.ssot.json");
  }
  const result = new Set();
  for (const entry of payload.domains) {
    if (typeof entry !== "string") {
      throw new Error("SSOT format error: domains must be strings");
    }
    const normalized = normalizeDomain(entry);
    if (!normalized) {
      continue;
    }
    result.add(normalized);
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const domains = readOfficialDomainsSSOT();
    console.log(`OFFICIAL_DOMAINS_SSOT_COUNT=${domains.size}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}
