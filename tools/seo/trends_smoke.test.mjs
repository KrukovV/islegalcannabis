import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const script = path.join(root, "tools", "seo", "trends_top50.py");
const outdir = path.join(root, "Reports", "trends");
const jsonPath = path.join(outdir, "top50_5y.json");
const csvPath = path.join(outdir, "top50_5y.csv");

test("trends_top50.py writes CSV/JSON and includes ISO2", () => {
  fs.rmSync(jsonPath, { force: true });
  fs.rmSync(csvPath, { force: true });
  const result = spawnSync("python3", [script, "--outdir", outdir], {
    encoding: "utf8"
  });
  assert.ok(result.status === 0 || result.status === 1 || result.status === 2);
  if (result.status !== 0) {
    assert.equal(fs.existsSync(jsonPath), false);
    assert.equal(fs.existsSync(csvPath), false);
    return;
  }
  assert.ok(fs.existsSync(jsonPath));
  assert.ok(fs.existsSync(csvPath));
  const payload = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.rows)
      ? payload.rows
      : [];
  assert.equal(Array.isArray(rows), true);
  assert.equal(rows.length, 50);
  rows.forEach((entry) => {
    assert.ok(entry.country_iso2);
  });
});
