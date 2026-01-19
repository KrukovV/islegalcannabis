import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const OUTPUT_PATH = path.join(ROOT, "data", "legal_ssot", "wiki_legality.json");

test("wiki legality parser outputs expected ISO entries", () => {
  const result = spawnSync(process.execPath, [
    path.join(ROOT, "tools", "legal_parse", "wiki_legality_parser.mjs")
  ]);
  assert.equal(result.status, 0, "parser should exit 0");
  assert.equal(fs.existsSync(OUTPUT_PATH), true, "wiki_legality.json missing");

  const payload = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf8"));
  const required = ["CA", "DE", "MX", "NL", "IT"];
  for (const code of required) {
    assert.ok(payload[code], `missing ${code}`);
    assert.ok(payload[code].wiki_url, `${code} wiki_url missing`);
    assert.ok(payload[code].recreational, `${code} recreational missing`);
    assert.ok(payload[code].medical, `${code} medical missing`);
  }
});
