import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

test("fill_official_catalog preserves existing and fills missing", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilc-official-"));
  const isoPath = path.join(tmpDir, "iso.json");
  const catalogPath = path.join(tmpDir, "catalog.json");

  fs.writeFileSync(
    isoPath,
    JSON.stringify(
      {
        entries: [
          { alpha2: "AA", name: "Aland" },
          { alpha2: "BB", name: "Bland" },
          { alpha2: "CC", name: "Cland" }
        ]
      },
      null,
      2
    )
  );
  const confirmation = {
    AA: { medical: ["https://example.gov/"], notes: "existing" }
  };
  fs.writeFileSync(catalogPath, JSON.stringify(confirmation, null, 2));

  const result = spawnSync(
    process.execPath,
    [path.join(process.cwd(), "tools", "sources", "fill_official_catalog.mjs")],
    { env: { ...process.env, ISO_PATH: isoPath, CATALOG_PATH: catalogPath } }
  );
  assert.equal(result.status, 0);

  const updated = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  assert.equal(Object.keys(updated).length, 3);
  assert.deepEqual(updated.AA.verified.medical, confirmation.AA.medical);
  assert.equal(updated.AA.notes, "existing");
  assert.deepEqual(updated.BB.verified.medical, []);
  assert.deepEqual(updated.CC.verified.recreational, []);
});
