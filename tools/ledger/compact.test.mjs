import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert";
import { spawnSync } from "node:child_process";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-"));
const ledgerPath = path.join(tmpDir, "CONTINUITY.md");
const archivePath = path.join(tmpDir, "ARCHIVE.md");

const doneLines = Array.from({ length: 12 }, (_, i) => `- Done item ${12 - i}`);
const ledger = [
  "Goal (incl. success criteria):",
  "- Goal",
  "",
  "Constraints/Assumptions:",
  "- None",
  "",
  "Key decisions:",
  "- Decision",
  "",
  "State:",
  "- State 1",
  "- State 2",
  "- State 3",
  "- State 4",
  "",
  "Done:",
  ...doneLines,
  "",
  "Now:",
  "- Now 1",
  "- Now 2",
  "- Now 3",
  "- Now 4",
  "",
  "Open questions (UNCONFIRMED if needed):",
  "- Q1",
  "",
  "Working set (files/ids/commands):",
  "- file"
].join("\n");

fs.writeFileSync(ledgerPath, ledger + "\n");

const run = () =>
  spawnSync("node", [
    path.join(process.cwd(), "tools", "ledger", "compact.mjs"),
    "--root",
    tmpDir,
    "--date",
    "2026-01-07",
    "--checkpoint",
    "checkpoint=.checkpoints/20260107-000000.patch"
  ], { stdio: "inherit" });

const first = run();
assert.strictEqual(first.status, 0);

const updated = fs.readFileSync(ledgerPath, "utf8");
const doneCount = updated.split(/\n/).filter((line) => line.startsWith("- Done item")).length;
assert.strictEqual(doneCount, 10);

const archive = fs.readFileSync(archivePath, "utf8");
const archivedCount = archive.split(/\n/).filter((line) => line.startsWith("- Done item")).length;
assert.strictEqual(archivedCount, 2);
const forbidden = [/Implement \{feature\}/i, /context left/i, /for shortcuts/i];
for (const pattern of forbidden) {
  assert.ok(!pattern.test(updated));
  assert.ok(!pattern.test(archive));
}

const second = run();
assert.strictEqual(second.status, 0);
const archiveAfter = fs.readFileSync(archivePath, "utf8");
assert.strictEqual(archive, archiveAfter);
