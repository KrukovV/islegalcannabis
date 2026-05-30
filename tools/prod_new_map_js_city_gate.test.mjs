import assert from "node:assert/strict";
import test from "node:test";
import { evaluateProdJsCityReport } from "./prod_new_map_js_city_gate.mjs";

const baseline = {
  require_no_access_block: true,
  min_rendered_countries: 120,
  min_city_labels: 3,
  max_city_label_ms: 3500,
  max_first_party_script_kib: 650,
  max_unused_estimated_transfer_kib: 80,
  max_unused_source_kib: 120,
  max_legacy_transfer_kib: 360,
  max_legacy_signal_count: 5
};

test("prod JS/city gate accepts current-quality report", () => {
  const result = evaluateProdJsCityReport({
    access_block: false,
    rendered_countries: 146,
    initial_js: {
      first_party_script_transfer_bytes: 580 * 1024,
      first_party_estimated_unused_transfer_bytes: 10 * 1024,
      first_party_chunk_unused_source_bytes: 48 * 1024,
      legacy_transfer_bytes: 335 * 1024,
      legacy_signal_count: 5
    },
    city_zoom: {
      ok: true,
      elapsed_ms: 900,
      label_count: 9
    }
  }, baseline);

  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
});

test("prod JS/city gate rejects access, city, JS, and legacy regressions", () => {
  const result = evaluateProdJsCityReport({
    access_block: true,
    rendered_countries: 80,
    initial_js: {
      first_party_script_transfer_bytes: 800 * 1024,
      first_party_estimated_unused_transfer_bytes: 120 * 1024,
      first_party_chunk_unused_source_bytes: 180 * 1024,
      legacy_transfer_bytes: 410 * 1024,
      legacy_signal_count: 7
    },
    city_zoom: {
      ok: false,
      reason: "TIMEOUT",
      elapsed_ms: 6000,
      label_count: 0
    }
  }, baseline);

  assert.equal(result.ok, false);
  assert.ok(result.failures.includes("ACCESS_BLOCK"));
  assert.ok(result.failures.some((item) => item.startsWith("RENDERED_COUNTRIES_LT_")));
  assert.ok(result.failures.includes("CITY_LABEL_REASON_TIMEOUT"));
  assert.ok(result.failures.some((item) => item.startsWith("CITY_LABELS_LT_")));
  assert.ok(result.failures.some((item) => item.startsWith("FIRST_PARTY_SCRIPT_KIB_GT_")));
  assert.ok(result.failures.some((item) => item.startsWith("UNUSED_ESTIMATED_TRANSFER_KIB_GT_")));
  assert.ok(result.failures.some((item) => item.startsWith("LEGACY_TRANSFER_KIB_GT_")));
  assert.ok(result.failures.some((item) => item.startsWith("LEGACY_SIGNAL_COUNT_GT_")));
});
