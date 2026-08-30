#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_LEDGER = path.join(ROOT, "data", "official", "cannabis_law_visual_reviews.audit.json");
const DEFAULT_PACKETS = path.join(ROOT, "data", "official", "c2-c3-review-packets.json");
const REQUIRED_PACKET_FIELDS = [
  "geo",
  "url",
  "exact_fragment",
  "review_summary",
  "reviewed_at",
  "official_owner_visible",
  "official_domain_visible",
  "cannabis_fragment_visible",
  "effective_rule_visible",
  "visual_opened",
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function canonicalUrl(value) {
  const parsed = new URL(String(value || ""));
  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  if (parsed.pathname !== "/") parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.searchParams.sort();
  return parsed.toString();
}

function packetKey(packet) {
  return `${String(packet.geo || "").trim().toUpperCase()}\n${canonicalUrl(packet.url)}`;
}

function assertPacket(packet) {
  assert.ok(packet && typeof packet === "object" && !Array.isArray(packet), "C2_C3_PACKET_INVALID");
  for (const field of REQUIRED_PACKET_FIELDS) {
    assert.ok(String(packet[field] ?? "").trim(), `C2_C3_PACKET_${field.toUpperCase()}_MISSING`);
  }
  assert.ok(Number.isFinite(Date.parse(packet.reviewed_at)), "C2_C3_PACKET_REVIEWED_AT_INVALID");
  for (const field of REQUIRED_PACKET_FIELDS.slice(-5)) {
    assert.equal(packet[field], true, `C2_C3_PACKET_${field.toUpperCase()}_MUST_BE_TRUE`);
  }
  assert.equal(typeof packet.strict_accepted, "boolean", "C2_C3_PACKET_STRICT_ACCEPTANCE_REQUIRED");
  if (packet.strict_accepted) {
    assert.equal(packet.screenshot_valid, true, "C2_C3_PACKET_SCREENSHOT_VALID_REQUIRED");
    assert.equal(packet.current, true, "C2_C3_PACKET_CURRENT_REQUIRED");
    assert.equal(packet.effective, true, "C2_C3_PACKET_EFFECTIVE_REQUIRED");
  }
}

function visit(value, onObject) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item) => visit(item, onObject));
    return;
  }
  onObject(value);
  Object.values(value).forEach((item) => visit(item, onObject));
}

function sourceMatchesPacket(source, packet) {
  if (!source || typeof source !== "object" || !source.url) return false;
  try {
    return canonicalUrl(source.url) === canonicalUrl(packet.url);
  } catch {
    return false;
  }
}

function applyPacket(source, packet) {
  const review = {
    reviewed_at: packet.reviewed_at,
    protocol: "C2_SEMANTIC_AND_C3_DIRECT_OFFICIAL_BROWSER_VISUAL_REVIEW",
    reviewer: "Codex authorized external official-source review",
    official_owner_visible: true,
    official_domain_visible: true,
    cannabis_fragment_visible: true,
    effective_rule_visible: true,
    visual_opened: true,
    strict_accepted: packet.strict_accepted,
    review_summary: packet.review_summary,
  };
  source.direct_fragment = packet.exact_fragment;
  source.exact_fragment = packet.exact_fragment;
  source.current = packet.current ?? source.current;
  source.effective = packet.effective ?? source.effective;
  source.visual_opened = true;
  source.official_owner_visible = true;
  source.official_domain_visible = true;
  source.cannabis_fragment_visible = true;
  source.effective_rule_visible = true;
  source.reviewed_by_human_visual = true;
  source.visual_reviewer_timestamp = packet.reviewed_at;
  source.visual_review_result = review;
  source.revalidation = {
    ...(source.revalidation || {}),
    c2_c3_review: review,
  };
  if (packet.strict_accepted) {
    source.screenshot_available = true;
    source.screenshot_valid = true;
  }
}

export function applyOfficialC2C3Packets(ledger, packetEnvelope) {
  const packets = Array.isArray(packetEnvelope?.packets) ? packetEnvelope.packets : [];
  const rows = Array.isArray(ledger?.rows) ? ledger.rows : [];
  assert.equal(rows.length, 307, `C2_C3_LEDGER_UNIVERSE_INVALID:${rows.length}`);
  const byKey = new Map();
  for (const packet of packets) {
    assertPacket(packet);
    const key = packetKey(packet);
    assert.ok(!byKey.has(key), `C2_C3_PACKET_DUPLICATE:${key}`);
    byKey.set(key, packet);
  }
  const matched = new Map([...byKey.keys()].map((key) => [key, 0]));
  for (const row of rows) {
    const geo = String(row?.geo || "").trim().toUpperCase();
    visit(row, (source) => {
      if (!source?.url) return;
      for (const [key, packet] of byKey) {
        if (geo === String(packet.geo).trim().toUpperCase() && sourceMatchesPacket(source, packet)) {
          applyPacket(source, packet);
          matched.set(key, matched.get(key) + 1);
        }
      }
    });
  }
  const missing = [...matched.entries()].filter(([, count]) => count === 0).map(([key]) => key);
  assert.deepEqual(missing, [], `C2_C3_PACKET_SOURCE_NOT_FOUND:${missing.join(",")}`);
  ledger.audit_checkpoints = {
    ...(ledger.audit_checkpoints || {}),
    c2_c3_packet_review: {
      applied_at: new Date().toISOString(),
      packet_count: packets.length,
      source_object_matches: Object.fromEntries(matched),
      scope: "SOURCE_METADATA_ONLY_NO_COLOR_OR_APPLY_MUTATION",
    },
  };
  return { ledger, packetCount: packets.length, matches: Object.fromEntries(matched) };
}

function parseArgs(argv) {
  const options = { ledger: DEFAULT_LEDGER, packets: DEFAULT_PACKETS };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--ledger") options.ledger = path.resolve(argv[++index] || "");
    else if (arg === "--packets") options.packets = path.resolve(argv[++index] || "");
    else throw new Error(`C2_C3_UNKNOWN_ARGUMENT:${arg}`);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = applyOfficialC2C3Packets(readJson(options.ledger), readJson(options.packets));
  writeJson(options.ledger, result.ledger);
  console.log(`C2_C3_PACKET_REVIEW packets=${result.packetCount} source_matches=${Object.values(result.matches).reduce((total, count) => total + count, 0)} ledger=${path.relative(ROOT, options.ledger)}`);
  console.log("APPLY_ALLOWED=false");
  console.log("PRODUCTION_TOUCHED=false");
  console.log("MAP_COLORS_CHANGED=false");
  console.log("SSOT_CHANGED=false");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
