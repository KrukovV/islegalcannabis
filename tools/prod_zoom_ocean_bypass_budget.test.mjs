import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const source = fs.readFileSync(path.join(ROOT, "tools", "prod_zoom_ocean_repeatability.mjs"), "utf8");

test("zoom ocean matrix uses storageState broker instead of direct cold warmup", () => {
  assert.match(source, /createProdContextWithBypass/);
  assert.doesNotMatch(source, /warmVercelBypass\(/);
  assert.match(source, /bypass-state/);
  assert.match(source, /no-bypass-warmup-if-state-valid/);
});

test("zoom ocean matrix does not warm up inside territory or cycle loops", () => {
  const territoryLoop = source.indexOf("for (const territory of territories)");
  const cycleLoop = source.indexOf("for (let cycle = 1");
  assert.ok(territoryLoop > 0, "territory loop must exist");
  assert.ok(cycleLoop > territoryLoop, "cycle loop must exist inside territory flow");
  assert.equal(source.slice(territoryLoop).includes("warmVercelBypass("), false);
  assert.equal(source.slice(cycleLoop).includes("warmVercelBypass("), false);
});

test("zoom ocean report exposes bypass budget counters", () => {
  assert.match(source, /bypass_warmup_count/);
  assert.match(source, /seed_request_count/);
  assert.match(source, /storage_state_used/);
  assert.match(source, /context_count/);
  assert.match(source, /page_count/);
  assert.match(source, /document_navigation_count/);
  assert.match(source, /BYPASS_WARMUP_BUDGET_EXCEEDED/);
});
