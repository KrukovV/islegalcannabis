import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
}

test("extract_from_snapshot marks law page with evidence", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilc-auto-facts-"));
  const prevCwd = process.cwd();
  try {
    process.chdir(tmpDir);
    writeJson(path.join(tmpDir, "data", "sources", "allow_domains.json"), {
      allow_suffixes: ["*.gov"]
    });
    const snapshotPath = path.join(tmpDir, "snapshots", "aa.html");
    writeFile(
      snapshotPath,
      "<html><h1>Law on Cannabis</h1><p>Article 1. Cannabis is prohibited for possession.</p></html>"
    );
    const scriptPath = path.join(
      prevCwd,
      "tools",
      "auto_facts",
      "extract_from_snapshot.mjs"
    );
    const result = spawnSync(
      process.execPath,
      [
        scriptPath,
        "--iso2",
        "AA",
        "--snapshot",
        snapshotPath,
        "--url",
        "https://example.gov/law"
      ],
      { encoding: "utf8" }
    );
    assert.equal(result.status, 0);
    const reportPath = path.join(tmpDir, "Reports", "auto_facts", "last_run.json");
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    assert.equal(report.evidence_count > 0, true);
    assert.equal(report.reason, "OK");
  } finally {
    process.chdir(prevCwd);
  }
});

test("extract_from_snapshot writes status claim when law text present", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilc-auto-facts-"));
  const prevCwd = process.cwd();
  try {
    process.chdir(tmpDir);
    writeJson(path.join(tmpDir, "data", "sources", "allow_domains.json"), {
      allow_suffixes: ["*.gov"]
    });
    const snapshotPath = path.join(tmpDir, "snapshots", "bb.html");
    writeFile(
      snapshotPath,
      "<html><h1>Law</h1><p>Article 1. Cannabis is prohibited for possession.</p></html>"
    );
    const scriptPath = path.join(
      prevCwd,
      "tools",
      "auto_facts",
      "extract_from_snapshot.mjs"
    );
    const result = spawnSync(
      process.execPath,
      [
        scriptPath,
        "--iso2",
        "BB",
        "--snapshot",
        snapshotPath,
        "--url",
        "https://example.gov/law"
      ],
      { encoding: "utf8" }
    );
    assert.equal(result.status, 0);
    const reportPath = path.join(tmpDir, "Reports", "auto_facts", "last_run.json");
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    assert.equal(report.status_claim?.type, "PROHIBITED");
    assert.equal(String(report.evidence?.[0]?.quote || "").includes("prohibited"), true);
  } finally {
    process.chdir(prevCwd);
  }
});

test("extract_from_snapshot blocks unbound status claim", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilc-auto-facts-"));
  const prevCwd = process.cwd();
  try {
    process.chdir(tmpDir);
    writeJson(path.join(tmpDir, "data", "sources", "allow_domains.json"), {
      allow_suffixes: ["*.gov"]
    });
    const snapshotPath = path.join(tmpDir, "snapshots", "cc.html");
    const filler = " loremipsum ".repeat(80);
    writeFile(
      snapshotPath,
      `<html><h1>Law</h1><p>Article 1. Narcotics are prohibited.</p><p>${filler}Schedule: Cannabis.</p></html>`
    );
    const scriptPath = path.join(
      prevCwd,
      "tools",
      "auto_facts",
      "extract_from_snapshot.mjs"
    );
    const result = spawnSync(
      process.execPath,
      [
        scriptPath,
        "--iso2",
        "CC",
        "--snapshot",
        snapshotPath,
        "--url",
        "https://example.gov/law"
      ],
      { encoding: "utf8" }
    );
    assert.equal(result.status, 0);
  const reportPath = path.join(tmpDir, "Reports", "auto_facts", "last_run.json");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(report.status_claim?.type, "UNKNOWN");
  assert.equal(report.reason, "NO_STATUS_PATTERN");
  } finally {
    process.chdir(prevCwd);
  }
});

test("buildEvidenceFromText keeps snippet around marker", async () => {
  const prevCwd = process.cwd();
  const scriptPath = path.join(
    prevCwd,
    "tools",
    "auto_facts",
    "extract_from_snapshot.mjs"
  );
  const module = await import(`file://${scriptPath}`);
  const anchor = { type: "html_anchor", anchor: "title", page: null };
  const text = "Section 1. Cannabis is prohibited under this act.";
  const result = module.buildEvidenceFromText(anchor, "/tmp/snap.pdf", text, "hash");
  assert.equal(Array.isArray(result.evidence), true);
  assert.equal(result.evidence.length > 0, true);
  assert.equal(result.evidence[0].quote.includes("cannabis"), true);
});

test("snippetContainsMarker rejects mismatched snippet", async () => {
  const prevCwd = process.cwd();
  const scriptPath = path.join(
    prevCwd,
    "tools",
    "auto_facts",
    "extract_from_snapshot.mjs"
  );
  const module = await import(`file://${scriptPath}`);
  const marker = module.CANNABIS_MARKERS?.find?.((item) => item.label === "cannabis");
  assert.equal(Boolean(marker), true);
  assert.equal(module.snippetContainsMarker("fentanyl only", marker), false);
});
