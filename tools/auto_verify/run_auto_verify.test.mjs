import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
}

test("AUTO_VERIFY reasons track evidence and delta reflects writes", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilc-auto-verify-"));
  const prevCwd = process.cwd();
  const prevEnv = { ...process.env };

  try {
    process.env.NETWORK = "1";
    process.env.AUTO_VERIFY = "1";
    process.env.AUTO_FACTS = "1";
    process.chdir(tmpDir);

    const factsReport = {
      extracted: 2,
      evidence_ok: 1,
      machine_verified_delta: 1,
      items: [
        {
          iso2: "AA",
          url: "https://example.gov/legal",
          evidence_ok: 1,
          machine_verified: true,
          content_type: "text/html",
          snapshot_path: "/tmp/snapshots/AA/meta.json",
          content_hash: "hash-aa"
        },
        {
          iso2: "BB",
          url: "https://example.gov/other",
          evidence_ok: 0,
          machine_verified: false,
          reason: "NO_EVIDENCE",
          content_type: "text/html",
          snapshot_path: "/tmp/snapshots/BB/meta.json",
          content_hash: "hash-bb"
        }
      ]
    };
    writeJson(path.join(tmpDir, "Reports", "auto_facts", "last_run.json"), factsReport);

    const scriptPath = path.join(
      prevCwd,
      "tools",
      "auto_verify",
      "run_auto_verify.mjs"
    );
    await import(`${scriptPath}?t=${Date.now()}`);

    const reportPath = path.join(tmpDir, "Reports", "auto_verify", "last_run.json");
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    const items = Array.isArray(report.items) ? report.items : [];
    const aa = items.find((item) => item.iso2 === "AA");
    const bb = items.find((item) => item.iso2 === "BB");

    assert.equal(Boolean(aa?.evidence_found), true);
    assert.equal(aa?.reason, "OK");
    assert.equal(Boolean(aa?.wrote_machine_verified), true);

    assert.equal(Boolean(bb?.evidence_found), false);
    assert.equal(bb?.reason, "NO_EVIDENCE");
    assert.equal(Boolean(bb?.wrote_machine_verified), false);

    const writtenCount = items.filter((item) => item.wrote_machine_verified).length;
    assert.equal(report.machine_verified_delta, writtenCount);
  } finally {
    process.chdir(prevCwd);
    for (const key of Object.keys(process.env)) {
      if (!(key in prevEnv)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(prevEnv)) {
      process.env[key] = value;
    }
  }
});
