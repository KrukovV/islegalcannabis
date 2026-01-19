import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
}

test("sanitizeMachineVerifiedEntries keeps law entries and removes non-law", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilc-mv-sanitize-"));
  const prevCwd = process.cwd();
  try {
    process.chdir(tmpDir);
    const mvPath = path.join(tmpDir, "data", "legal_ssot", "machine_verified.json");
    writeJson(mvPath, {
      entries: {
        AA: {
          iso2: "AA",
          content_hash: "hash-aa",
          evidence_kind: "law",
          evidence: [{ anchor: "a1", quote: "cannabis", page: "1" }]
        },
        BB: {
          iso2: "BB",
          content_hash: "hash-bb",
          evidence_kind: "non_law",
          evidence: [{ anchor: "b1", quote: "news", page: "1" }]
        }
      }
    });
    const scriptPath = path.join(prevCwd, "tools", "auto_facts", "run_auto_facts.mjs");
    const module = await import(`file://${scriptPath}`);
    module.sanitizeMachineVerifiedEntries();
    const payload = JSON.parse(fs.readFileSync(mvPath, "utf8"));
    const entries = payload.entries || payload;
    assert.ok(entries.AA);
    assert.equal(Boolean(entries.BB), false);
  } finally {
    process.chdir(prevCwd);
  }
});

test("sanitizeMachineVerifiedEntries does not zero out all entries", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilc-mv-sanitize-"));
  const prevCwd = process.cwd();
  try {
    process.chdir(tmpDir);
    const mvPath = path.join(tmpDir, "data", "legal_ssot", "machine_verified.json");
    writeJson(mvPath, {
      entries: {
        CC: {
          iso2: "CC",
          content_hash: "hash-cc",
          evidence_kind: "non_law",
          evidence: [{ anchor: "c1", quote: "portal", page: "1" }]
        }
      }
    });
    const scriptPath = path.join(prevCwd, "tools", "auto_facts", "run_auto_facts.mjs");
    const module = await import(`file://${scriptPath}`);
    module.sanitizeMachineVerifiedEntries();
    const payload = JSON.parse(fs.readFileSync(mvPath, "utf8"));
    const entries = payload.entries || payload;
    assert.ok(entries.CC);
  } finally {
    process.chdir(prevCwd);
  }
});
