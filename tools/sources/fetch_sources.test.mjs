import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

test("fetch_sources writes snapshot and sha256 meta", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilc-fetch-"));
  const registryPath = path.join(tmpDir, "registry.json");
  const outDir = path.join(tmpDir, "snapshots");
  const fixturesDir = path.join(process.cwd(), "tools", "sources", "fixtures");

  fs.writeFileSync(
    registryPath,
    JSON.stringify(
      {
        ssot_sources: [
          {
            iso2: "DE",
            kind: "medical",
            type: "verified",
            url: "https://example.gov/medical"
          }
        ]
      },
      null,
      2
    )
  );

  const result = spawnSync(
    process.execPath,
    [
      path.join(process.cwd(), "tools", "sources", "fetch_sources.mjs"),
      "--registry",
      registryPath,
      "--out",
      outDir
    ],
    {
      env: { ...process.env, OFFLINE_FIXTURES_DIR: fixturesDir },
      stdio: "inherit"
    }
  );
  assert.equal(result.status, 0);

  const dayDir = fs.readdirSync(path.join(outDir, "DE"))[0];
  const metaPath = path.join(outDir, "DE", dayDir, "meta.json");
  assert.equal(fs.existsSync(metaPath), true);
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  assert.equal(meta.items.length, 1);
  assert.ok(meta.items[0].sha256);
});
