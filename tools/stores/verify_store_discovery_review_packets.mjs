#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PACKETS_PATH = path.join(ROOT, "data/store_truth/store_discovery_review_packets.json");
const HISTORY_PATH = path.join(ROOT, "data/store_truth/store_discovery_review_history.json");
const CANONICAL_GEOS_PATH = path.join(ROOT, "data/reviews/geo-list-307.json");
const PACKET_DISPOSITIONS = new Set([
  "RETAIN_NO_CURRENT_LOCATION_REGISTRY",
  "RETAIN_NO_PUBLIC_INDIVIDUAL_LOCATION_REGISTRY",
  "RETAIN_CURRENT_CANNABIS_LOCATION_LIST_C3_UNCONFIRMED",
  "RETAIN_GENERIC_PHARMACY_REGISTRY_NOT_CANNABIS_LOCATION_INVENTORY",
  "RETAIN_OFFICIAL_HISTORICAL_REGISTER_NO_CURRENT_PROMOTION",
  "RETAIN_HISTORICAL_NAMED_DISPENSARY_ANNOUNCEMENT_NO_CURRENT_PROMOTION",
  "RETAIN_NO_DOMESTIC_CANNABIS_STOREFRONT_MODEL",
  "RETAIN_CURRENT_NARROW_PROTOCOL_NO_PUBLIC_LOCATION_REGISTRY",
  "RETAIN_OFFICIAL_ACCESS_BLOCKED_NO_PROMOTION",
  "RETAIN_CANNABIS_PHARMACY_LAW_NO_PUBLIC_PREMISE_INVENTORY",
]);
const PACKET_C3_STATES = new Set([
  "NOT_RUN_NO_PROMOTION",
  "PROVEN_NO_PROMOTION",
]);

export function verifyStoreDiscoveryReviewPackets({ packets, history, canonicalGeos }) {
  assert.equal(packets.schema_version, 1, "STORE_DISCOVERY_PACKET_SCHEMA_INVALID");
  assert.equal(packets.local_only, true, "STORE_DISCOVERY_PACKET_NOT_LOCAL_ONLY");
  assert(Array.isArray(packets.reviews) && packets.reviews.length > 0, "STORE_DISCOVERY_PACKET_EMPTY");
  assert.equal(new Set(packets.reviews.map((review) => review.review_id)).size, packets.reviews.length, "STORE_DISCOVERY_PACKET_DUPLICATE_ID");
  assert.equal(new Set(packets.reviews.map((review) => review.geo_id)).size, packets.reviews.length, "STORE_DISCOVERY_PACKET_DUPLICATE_GEO");
  assert.equal(history.schema_version, 1, "STORE_DISCOVERY_HISTORY_SCHEMA_INVALID");
  assert.equal(history.local_only, true, "STORE_DISCOVERY_HISTORY_NOT_LOCAL_ONLY");
  assert(Array.isArray(history.reviews), "STORE_DISCOVERY_HISTORY_REVIEWS_INVALID");
  assert.equal(new Set(history.reviews.map((review) => review.review_id)).size, history.reviews.length, "STORE_DISCOVERY_HISTORY_DUPLICATE_ID");
  const historyByGeo = new Map();
  for (const review of history.reviews) {
    assert(canonicalGeos.has(review.geo_id), `STORE_DISCOVERY_HISTORY_GEO_INVALID:${review.geo_id}`);
    assert(typeof review.source_family === "string" && review.source_family.length > 0, `STORE_DISCOVERY_HISTORY_SOURCE_FAMILY_INVALID:${review.geo_id}`);
    assert(typeof review.evidence_ref === "string" && review.evidence_ref.length > 0, `STORE_DISCOVERY_HISTORY_EVIDENCE_REF_INVALID:${review.geo_id}`);
    const sourceFamilies = historyByGeo.get(review.geo_id) || new Set();
    assert(!sourceFamilies.has(review.source_family), `STORE_DISCOVERY_HISTORY_DUPLICATE_SOURCE_FAMILY:${review.geo_id}`);
    sourceFamilies.add(review.source_family);
    historyByGeo.set(review.geo_id, sourceFamilies);
  }
  for (const review of packets.reviews) {
  assert(canonicalGeos.has(review.geo_id), `STORE_DISCOVERY_PACKET_GEO_INVALID:${review.geo_id}`);
  assert(PACKET_C3_STATES.has(review.c3_status), `STORE_DISCOVERY_PACKET_C3_STATE_INVALID:${review.geo_id}`);
  assert(PACKET_DISPOSITIONS.has(review.disposition), `STORE_DISCOVERY_PACKET_DISPOSITION_INVALID:${review.geo_id}`);
  assert(typeof review.c2 === "string" && review.c2.length > 40, `STORE_DISCOVERY_PACKET_C2_MISSING:${review.geo_id}`);
  assert(Array.isArray(review.c1) && review.c1.length > 0, `STORE_DISCOVERY_PACKET_C1_MISSING:${review.geo_id}`);
  for (const source of review.c1) {
    assert(/^https:\/\//.test(source.url), `STORE_DISCOVERY_PACKET_URL_INVALID:${review.geo_id}`);
    assert(Number.isInteger(source.http_status) && source.http_status >= 100 && source.http_status <= 599, `STORE_DISCOVERY_PACKET_HTTP_INVALID:${review.geo_id}`);
    assert(/^[a-f0-9]{64}$/.test(source.response_sha256), `STORE_DISCOVERY_PACKET_SHA_INVALID:${review.geo_id}`);
  }
    const historicalFamilies = historyByGeo.get(review.geo_id);
    if (historicalFamilies) {
      assert(typeof review.source_family === "string" && review.source_family.length > 0, `STORE_DISCOVERY_PACKET_HISTORICAL_COVERAGE_REQUIRES_SOURCE_FAMILY:${review.geo_id}`);
      assert.equal(review.materially_new_official_complete_source, true, `STORE_DISCOVERY_PACKET_HISTORICAL_COVERAGE_REQUIRES_MATERIAL_NEW_OFFICIAL_SOURCE:${review.geo_id}`);
      assert(!historicalFamilies.has(review.source_family), `STORE_DISCOVERY_PACKET_HISTORICAL_DUPLICATE_SOURCE_FAMILY:${review.geo_id}`);
    }
  }
  return { packetCount: packets.reviews.length, historicalReviewCount: history.reviews.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const packets = JSON.parse(fs.readFileSync(PACKETS_PATH, "utf8"));
  const history = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"));
  const canonicalGeos = new Set(JSON.parse(fs.readFileSync(CANONICAL_GEOS_PATH, "utf8")));
  const result = verifyStoreDiscoveryReviewPackets({ packets, history, canonicalGeos });
  console.log(`STORE_DISCOVERY_REVIEW_PACKETS_OK=${result.packetCount} HISTORICAL_COVERAGE_OK=${result.historicalReviewCount}`);
}
