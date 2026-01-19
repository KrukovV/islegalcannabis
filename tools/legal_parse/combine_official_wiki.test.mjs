import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const OUTPUT_PATH = path.join(ROOT, "data", "legal_ssot", "legal_ssot.json");

test("combine official + wiki keeps official sources and wiki_url", () => {
  const parseResult = spawnSync(process.execPath, [
    path.join(ROOT, "tools", "legal_parse", "wiki_legality_parser.mjs")
  ]);
  assert.equal(parseResult.status, 0, "wiki parser should exit 0");

  const combineResult = spawnSync(process.execPath, [
    path.join(ROOT, "tools", "legal_parse", "combine_official_wiki.mjs")
  ]);
  assert.equal(combineResult.status, 0, "combine should exit 0");
  assert.equal(fs.existsSync(OUTPUT_PATH), true, "legal_ssot.json missing");

  const payload = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf8"));
  for (const code of ["CA", "DE"]) {
    assert.ok(payload[code], `missing ${code}`);
    assert.ok(payload[code].wiki_url, `${code} wiki_url missing`);
    assert.ok(Array.isArray(payload[code].official_sources), `${code} sources missing`);
    assert.ok(payload[code].official_sources.length > 0, `${code} sources empty`);
  }
});
