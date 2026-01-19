import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { writeCheckedArtifact } from "./checked_artifact.mjs";

test("writeCheckedArtifact writes 50 entries with kinds and names", () => {
  const checks = Array.from({ length: 50 }, (_, idx) => {
    if (idx % 2 === 0) {
      return { id: "US-CA", country: "US", region: "CA" };
    }
    return { id: "HM", country: "HM" };
  });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilc-checked-"));
  const outputPath = path.join(tempDir, "last_checked.json");
  const result = writeCheckedArtifact(checks, outputPath);
  assert.equal(result.count, 50);
  const payload = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(payload.length, 50);
  payload.slice(0, 10).forEach((entry) => {
    assert.ok(entry.id);
    assert.ok(entry.flag !== undefined);
    assert.ok(entry.kind === "region" || entry.kind === "country");
    assert.ok(typeof entry.name === "string");
    assert.ok(entry.name.length > 0);
    if (entry.kind === "region") {
      assert.ok(entry.name.includes("United States"));
      assert.ok(entry.name.includes("/"));
    }
  });
});
