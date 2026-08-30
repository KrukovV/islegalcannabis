import assert from "node:assert/strict";
import test from "node:test";
import { applyOfficialC2C3Packets } from "./apply_official_c2_c3_packets.mjs";

const reviewedPacket = {
  geo: "AA",
  url: "https://official.example/current-route",
  current: true,
  effective: true,
  strict_accepted: true,
  screenshot_valid: true,
  official_owner_visible: true,
  official_domain_visible: true,
  cannabis_fragment_visible: true,
  effective_rule_visible: true,
  visual_opened: true,
  reviewed_at: "2026-08-13T07:42:00.000Z",
  exact_fragment: "Current official cannabis route.",
  review_summary: "Official owner, rule and route are visible.",
};

function canonicalLedger() {
  const rows = Array.from({ length: 307 }, (_, index) => ({
    geo: index === 0 ? "AA" : `ZZ-${String(index).padStart(3, "0")}`,
  }));
  rows[0].verified_sources = [{
    url: "https://official.example/current-route?source=registry",
    independent_truth_color: "YELLOW",
  }];
  return { rows };
}

test("C2/C3 packet updates only matched source metadata and retains legal fields", () => {
  const ledger = canonicalLedger();
  const result = applyOfficialC2C3Packets(ledger, {
    packets: [{ ...reviewedPacket, url: "https://official.example/current-route?source=registry" }],
  });
  const source = result.ledger.rows[0].verified_sources[0];
  assert.equal(source.exact_fragment, "Current official cannabis route.");
  assert.equal(source.visual_review_result.strict_accepted, true);
  assert.equal(source.independent_truth_color, "YELLOW");
  assert.equal(result.ledger.audit_checkpoints.c2_c3_packet_review.scope, "SOURCE_METADATA_ONLY_NO_COLOR_OR_APPLY_MUTATION");
});

test("C2/C3 packet rejects a URL that is not present for its exact GEO", () => {
  assert.throws(
    () => applyOfficialC2C3Packets(canonicalLedger(), { packets: [reviewedPacket] }),
    /C2_C3_PACKET_SOURCE_NOT_FOUND/,
  );
});
