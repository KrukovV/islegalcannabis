import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

test("official_catalog_autofill merges candidates deterministically", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilc-autofill-"));
  const isoPath = path.join(tmpDir, "iso.json");
  const catalogPath = path.join(tmpDir, "catalog.json");
  const outPath = path.join(tmpDir, "out.json");
  const fixturePath = path.join(
    process.cwd(),
    "tools",
    "sources",
    "fixtures",
    "wikidata_sample.json"
  );

  fs.writeFileSync(
    isoPath,
    JSON.stringify(
      { entries: [{ alpha2: "AA" }, { alpha2: "BB" }] },
      null,
      2
    )
  );
  fs.writeFileSync(
    catalogPath,
    JSON.stringify(
      {
        AA: { medical: ["https://existing.gov/"], notes: "existing" }
      },
      null,
      2
    )
  );

  const run = () =>
    spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), "tools", "sources", "official_catalog_autofill.mjs"),
        "--iso",
        isoPath,
        "--catalog",
        catalogPath,
        "--output",
        outPath,
        "--fixture",
        fixturePath,
        "--max-per-iso",
        "3"
      ],
      { stdio: "inherit" }
    );

  const first = run();
  assert.equal(first.status, 0);
  const initial = fs.readFileSync(outPath, "utf8");

  const second = run();
  assert.equal(second.status, 0);
  const repeat = fs.readFileSync(outPath, "utf8");
  assert.equal(initial, repeat, "output should be deterministic");

  const parsed = JSON.parse(initial);
  assert.deepEqual(parsed.AA.verified.medical, ["https://existing.gov/"]);
  assert.ok(parsed.AA.candidates.length >= 1);
  assert.ok(parsed.BB.candidates.length >= 1);
  assert.equal(parsed.BB.candidates.some((url) => url.includes("wikipedia")), false);
});
