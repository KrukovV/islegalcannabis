#!/usr/bin/env node
// Analyze an existing production receipt without launching browsers or requests.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const input = process.argv[2];
assert.ok(input, "Usage: node tools/analyze_public_map_cold.mjs <cold-receipt.json>");
const receipt = JSON.parse(fs.readFileSync(input, "utf8"));
const commit = (meta) => meta?.commit || meta?.buildSha;
const finite = (value) => assert.ok(Number.isFinite(value) && value >= 0, "Missing or invalid timing");
assert.equal(receipt.base, "https://www.islegal.info");
assert.equal(receipt.artificialDelays, false);
assert.equal(receipt.networkInterception, false);
assert.match(commit(receipt.before) || "", /^[a-f0-9]{40}$/);
assert.equal(commit(receipt.after), commit(receipt.before), "Build changed during measurement");
assert.ok(receipt.before.buildId);
assert.equal(receipt.after.buildId, receipt.before.buildId);
assert.ok(Array.isArray(receipt.rows) && receipt.rows.length > 0);

const rows = receipt.rows.map((row) => {
  assert.equal(typeof row.mobile, "boolean");
  assert.deepEqual(row.errors, [], "Browser errors invalidate the cohort");
  assert.ok(Array.isArray(row.resources));
  // Worker fetches need the browser network event timing; they need not appear
  // in the document's Resource Timing buffer. Never combine the two copies.
  const candidates = row.countryNetwork === undefined ? row.resources : row.countryNetwork;
  assert.ok(Array.isArray(candidates));
  const matches = candidates.filter((r) => /^https:\/\/www\.islegal\.info\/static\/truth-map\/countries\.[a-f0-9]+\.json\.br$/.test(r.name) && r.encodedBodySize > 0);
  assert.equal(matches.length, 1, "Exactly one complete GEO response required");
  const geo = matches[0];
  if (row.countryNetwork !== undefined) {
    assert.equal(row.countryRequests, 1);
    assert.equal(row.features, 276);
    assert.equal(row.sourceHash, "6e4d50dee3bd");
    finite(row.strictRenderAt);
    assert.ok(row.readyMs >= row.strictRenderAt);
  }
  const constructor = row.trace?.marks?.NM_T2_MAP_CONSTRUCTOR_START;
  const firstByte = row.navigation?.responseStart;
  for (const timing of [row.readyMs, firstByte, constructor, geo.startTime, geo.requestStart, geo.responseStart, geo.responseEnd]) finite(timing);
  assert.ok(firstByte <= geo.startTime && geo.startTime <= geo.requestStart && geo.requestStart <= geo.responseStart && geo.responseStart <= geo.responseEnd);
  assert.ok(row.readyMs >= Math.max(geo.responseEnd, constructor), "Ready precedes its prerequisites");
  return {
    mobile: row.mobile,
    readyMs: row.readyMs,
    htmlFirstByteMs: Math.round(firstByte),
    geoStartMs: Math.round(geo.startTime),
    geoDiscoveryAfterHtmlMs: Math.round(geo.startTime - firstByte),
    geoHeadersMs: Math.round(geo.responseStart - geo.requestStart),
    geoBodyMs: Math.round(geo.responseEnd - geo.responseStart),
    geoEncodedBytes: geo.encodedBodySize,
    constructorMs: Math.round(constructor),
    laterPrerequisite: constructor > geo.responseEnd ? "MAP_CONSTRUCTOR" : "GEO_RESPONSE",
    constructorAfterGeoMs: Math.round(Math.max(0, constructor - geo.responseEnd)),
    readyAfterBothMs: Math.round(row.readyMs - Math.max(constructor, geo.responseEnd)),
    externalCssRequests: row.resources.filter((r) => /\.css(?:\?|$)/.test(r.name)).length
  };
});

const groups = Object.fromEntries([true, false].map((mobile) => {
  const values = rows.filter((row) => row.mobile === mobile).map((row) => row.readyMs).sort((a, b) => a - b);
  assert.ok(values.length > 0, "Both mobile and desktop required");
  const middle = Math.floor(values.length / 2);
  return [mobile ? "mobile" : "desktop", {
    count: values.length,
    minMs: values[0],
    medianMs: values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2,
    maxMs: values.at(-1),
    atMost2000Ms: values.filter((value) => value <= 2000).length
  }];
}));

console.log(JSON.stringify({
  input: path.resolve(input),
  measuredAt: receipt.at,
  commit: commit(receipt.before),
  buildId: receipt.before.buildId,
  definition: "First rendered legal-ready marker; mobile viewport emulation, not physical devices or complete native-tile readiness. Overlapping phases must not be added. Later prerequisite is timing order, not root-cause attribution. One cohort cannot prove stable production latency.",
  historicalTargetMs: 2000,
  targetMetInEveryRecordedRun: rows.every((row) => row.readyMs <= 2000),
  groups,
  rows
}, null, 2));
