import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

test("validate_sources fails when known without https sources", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilc-laws-"));
  const root = path.join(tempDir, "data", "laws", "world");
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    path.join(root, "ZZ.json"),
    JSON.stringify(
      {
        id: "ZZ",
        country: "ZZ",
        medical: "illegal",
        recreational: "illegal",
        public_use: "illegal",
        cross_border: "illegal",
        status: "known",
        sources: []
      },
      null,
      2
    )
  );
  const script = path.join(process.cwd(), "tools", "laws", "validate_sources.mjs");
  const result = spawnSync(process.execPath, [script], {
    cwd: tempDir,
    encoding: "utf8"
  });
  assert.notEqual(result.status, 0);
});
