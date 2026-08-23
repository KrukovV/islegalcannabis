import assert from "node:assert/strict";
import test from "node:test";
import { verifyStoreDiscoveryReviewPackets } from "./verify_store_discovery_review_packets.mjs";

const canonicalGeos = new Set(["EC"]);
const history = {
  schema_version: 1,
  local_only: true,
  reviews: [{ review_id: "EC:historical", geo_id: "EC", source_family: "ARCSA_QUERY", evidence_ref: "test" }],
};

function packet(overrides = {}) {
  return {
    review_id: "EC:new",
    geo_id: "EC",
    store_type: "CANNABIS_PHARMACY",
    authority: "ARCSA",
    c1: [{ url: "https://example.gov.ec/source", http_status: 200, response_sha256: "a".repeat(64) }],
    c2: "A current official source was reviewed with enough detail to exercise the packet schema.",
    c3_status: "NOT_RUN_NO_PROMOTION",
    disposition: "RETAIN_NO_CURRENT_LOCATION_REGISTRY",
    result: "No promotion.",
    ...overrides,
  };
}

function verify(review) {
  return verifyStoreDiscoveryReviewPackets({ packets: { schema_version: 1, local_only: true, reviews: [review] }, history, canonicalGeos });
}

test("historical Store coverage requires an explicit materially new official source family", () => {
  assert.throws(() => verify(packet()), /STORE_DISCOVERY_PACKET_HISTORICAL_COVERAGE_REQUIRES_SOURCE_FAMILY:EC/);
  assert.throws(() => verify(packet({ source_family: "ARCSA_QUERY", materially_new_official_complete_source: true })), /STORE_DISCOVERY_PACKET_HISTORICAL_DUPLICATE_SOURCE_FAMILY:EC/);
  assert.doesNotThrow(() => verify(packet({ source_family: "ARCSA_OPEN_DATA_COMPLETE_REGISTRY", materially_new_official_complete_source: true })));
});
