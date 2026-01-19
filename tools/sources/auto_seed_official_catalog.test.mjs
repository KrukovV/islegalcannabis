import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { autoSeedOfficialCatalog } from "./auto_seed_official_catalog.mjs";

test("auto-seed adds validated official urls and skips banned domains", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilc-seed-"));
  const catalogPath = path.join(tmpDir, "official_catalog.json");
  const isoPath = path.join(tmpDir, "iso.json");
  const candidatesPath = path.join(tmpDir, "candidates.json");
  const reportPath = path.join(process.cwd(), "Reports", "auto_seed", "last_seed.json");

  fs.writeFileSync(
    isoPath,
    JSON.stringify([{ alpha2: "AA" }, { alpha2: "BB" }], null, 2)
  );
  fs.writeFileSync(
    catalogPath,
    JSON.stringify({ AA: { official: ["https://aa.gov/"], notes: "seeded" } }, null, 2)
  );

  fs.writeFileSync(
    candidatesPath,
    JSON.stringify({ generated_at: "2025-01-01", candidates: { BB: ["https://example.gov.uk/"] } }, null, 2)
  );

  const fetchImpl = async (url) => {
    if (String(url) === "https://example.gov.uk/") {
      return { ok: true, status: 200, url, headers: { get: () => null } };
    }
    return { ok: false, status: 500, url, headers: { get: () => null } };
  };

  const report = await autoSeedOfficialCatalog({
    catalogPath,
    isoPath,
    candidatesPath,
    limit: 2,
    fetchImpl
  });

  const updated = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  assert.ok(updated.AA.official.length === 1);
  assert.ok(updated.BB.official.length === 1);
  assert.equal(updated.BB.official[0], "https://example.gov.uk/");
  assert.equal(report.added_count, 1);
  assert.equal(report.before_count, 1);
  assert.equal(report.after_count, 2);
  assert.ok(fs.existsSync(reportPath));
});
