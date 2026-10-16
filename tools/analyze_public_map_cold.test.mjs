import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

function fixture() {
  const meta = { commit: "0".repeat(40), buildId: "TEST_FIXTURE_NOT_PRODUCTION" };
  return {
    base: "https://www.islegal.info", artificialDelays: false, networkInterception: false,
    before: meta, after: meta, browserContextMode: "fresh-persistent",
    rows: [true, false].map((mobile) => ({
      engine: "webkit", mobile, errors: [], resources: [], features: 276, sourceHash: "6e4d50dee3bd",
      readyMs: mobile ? 1900 : 1800, strictRenderAt: 1750,
      navigation: { responseStart: 400 }, trace: { marks: { NM_T2_MAP_CONSTRUCTOR_START: 900 } },
      countryRequests: 1,
      countryNetwork: [{ name: "https://www.islegal.info/static/truth-map/countries.6e4d50dee3bd.json.br",
        encodedBodySize: 544138, startTime: 500, requestStart: 510, responseStart: 600, responseEnd: 1300 }]
    }))
  };
}

function analyze(t, receipt) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "islegal-cold-reader-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "fixture.json");
  fs.writeFileSync(file, JSON.stringify(receipt));
  return spawnSync(process.execPath, ["tools/analyze_public_map_cold.mjs", file], { encoding: "utf8" });
}

test("rendered complete-source cohort retains its explicit browser profile", (t) => {
  const result = analyze(t, fixture());
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.browserContextMode, "fresh-persistent");
  assert.equal(report.browserEngine, "webkit");
  assert.equal(report.groups.mobile.count, 1);
  assert.equal(report.groups.desktop.count, 1);
});

test("historical ready-only marker cannot become rendering proof", (t) => {
  const receipt = fixture();
  delete receipt.rows[0].strictRenderAt;
  assert.notEqual(analyze(t, receipt).status, 0);
});

test("private and persistent cohorts cannot silently share summary statistics", (t) => {
  const receipt = fixture();
  receipt.rows[0].browserContextMode = "nonpersistent";
  assert.match(analyze(t, receipt).stderr, /Mixed browser context modes/);
});

test("different browser engines require separate cohorts", (t) => {
  const receipt = fixture();
  receipt.rows[0].engine = "chromium";
  assert.match(analyze(t, receipt).stderr, /Mixed browser engines/);
});

test("missing historic context mode stays unrecorded", (t) => {
  const receipt = fixture();
  delete receipt.browserContextMode;
  const result = analyze(t, receipt);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).browserContextMode, "NOT_RECORDED");
});

test("resource-timing fallback cannot hide a missing complete-source identity", (t) => {
  const receipt = fixture();
  for (const row of receipt.rows) {
    row.resources = row.countryNetwork;
    delete row.countryNetwork;
    delete row.sourceHash;
  }
  assert.match(analyze(t, receipt).stderr, /Complete source identity required/);
});
