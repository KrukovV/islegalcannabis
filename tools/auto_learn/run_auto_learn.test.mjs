import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { isLawPageFromSnapshot } from "./is_law_page.mjs";

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
}

async function runAutoLearnWithExitHandled(runAutoLearn) {
  const prevExit = process.exit;
  process.exit = (code = 0) => {
    const error = new Error(`EXIT_${code}`);
    error.exitCode = code;
    throw error;
  };
  try {
    await runAutoLearn();
  } catch (error) {
    if (!Number.isFinite(error?.exitCode)) {
      throw error;
    }
  } finally {
    process.exit = prevExit;
  }
}

test("AUTO_LEARN_MIN_PROVISIONAL writes catalog only after snapshot", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilc-auto-learn-min-"));
  const prevCwd = process.cwd();
  const prevFetch = globalThis.fetch;
  const prevEnv = { ...process.env };

  try {
    process.env.AUTO_LEARN_TEST_ROOT = tmpDir;
    process.env.NETWORK = "1";
    process.env.AUTO_LEARN_MODE = "min_sources";
    process.env.AUTO_LEARN_MIN_PROVISIONAL = "1";

    process.chdir(tmpDir);

    writeJson(path.join(tmpDir, "data", "iso3166", "iso3166-1.json"), {
      entries: [{ alpha2: "AA" }]
    });
    writeJson(path.join(tmpDir, "data", "sources", "official_catalog.json"), {
      AA: { missing_official: true, medical: [], recreational: [] }
    });
    writeJson(path.join(tmpDir, "data", "sources", "allowlist_domains.json"), {
      allowed: ["example.gov"]
    });
    writeJson(path.join(tmpDir, "data", "sources", "domain_denylist.json"), {
      banned: []
    });
    writeJson(path.join(tmpDir, "data", "sources", "wikidata_candidates.json"), {
      candidates: { AA: ["https://example.gov/"] }
    });
    writeJson(path.join(tmpDir, "data", "sources", "sources_registry.json"), {
      AA: [{ title: "Official source", url: "https://example.gov/" }]
    });
    writeJson(path.join(tmpDir, "data", "laws", "world", "AA.json"), {
      id: "AA",
      review_status: "provisional"
    });
    const discoveryStub = path.join(
      tmpDir,
      "tools",
      "auto_learn",
      "wikidata_discovery.mjs"
    );
    fs.mkdirSync(path.dirname(discoveryStub), { recursive: true });
    fs.writeFileSync(discoveryStub, "process.exit(0);\n");
    const registryStub = path.join(
      tmpDir,
      "tools",
      "sources",
      "registry_from_catalog.mjs"
    );
    fs.mkdirSync(path.dirname(registryStub), { recursive: true });
    fs.writeFileSync(registryStub, "process.exit(0);\n");
    const extractStub = path.join(
      tmpDir,
      "tools",
      "auto_facts",
      "extract_evidence_from_snapshot.mjs"
    );
    fs.mkdirSync(path.dirname(extractStub), { recursive: true });
    fs.writeFileSync(
      extractStub,
      [
        "import fs from 'node:fs';",
        "import path from 'node:path';",
        "const args=process.argv.slice(2);",
        "const out=args[args.indexOf('--out')+1];",
        "fs.mkdirSync(path.dirname(out),{recursive:true});",
        "fs.writeFileSync(out, JSON.stringify({",
        "  evidence_ok: 1,",
        "  evidence_kind: 'law',",
        "  law_marker_found: true,",
        "  cannabis_marker_found: true,",
        "  reason: 'OK'",
        "}, null, 2) + '\\n');",
        "process.exit(0);"
      ].join("\n")
    );

    const longText = "cannabis ".repeat(80);
    globalThis.fetch = async (url) => ({
      status: 200,
      url,
      headers: { get: () => "text/html" },
      arrayBuffer: async () =>
        Buffer.from(
          `<html><head><title>Law Act</title></head><body><h1>Drug Law</h1><p>Section 1 Article 2 Official Gazette</p><p>${longText}</p></body></html>`
        )
    });

    const { runAutoLearn } = await import(
      `./run_auto_learn.mjs?cache=${Date.now()}`
    );
    await runAutoLearnWithExitHandled(runAutoLearn);

    const reportPath = path.join(tmpDir, "Reports", "auto_learn", "last_run.json");
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    const snapshotExists = report.snapshot_path && fs.existsSync(report.snapshot_path);
    assert.equal(Boolean(report.catalog_written), Boolean(snapshotExists));
    assert.equal(report.provisional_with_sources_delta, 1);
    assert.equal(report.law_pages, 1);
  } finally {
    process.chdir(prevCwd);
    globalThis.fetch = prevFetch;
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

test("isLawPageFromSnapshot detects law structure", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilc-law-page-"));
  const lawPath = path.join(tmpDir, "law.html");
  const portalPath = path.join(tmpDir, "portal.html");
  fs.writeFileSync(
    lawPath,
    "<html><head><title>Law Act</title></head><body><h1>Act</h1><p>Section 1 Article 2 Official Gazette</p><p>cannabis</p></body></html>"
  );
  fs.writeFileSync(
    portalPath,
    "<html><head><title>Government Portal</title></head><body><h1>Welcome</h1><p>Services and news</p></body></html>"
  );
  const lawResult = isLawPageFromSnapshot(lawPath, "https://example.gov/law/act");
  const portalResult = isLawPageFromSnapshot(
    portalPath,
    "https://example.gov/portal"
  );
  assert.equal(lawResult.ok, true);
  assert.equal(portalResult.ok, false);
});

test("TRACE_ISO writes trace and respects crawl limit", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ilc-auto-learn-trace-"));
  const prevCwd = process.cwd();
  const prevFetch = globalThis.fetch;
  const prevEnv = { ...process.env };

  try {
    process.env.AUTO_LEARN_TEST_ROOT = tmpDir;
    process.env.NETWORK = "1";
    process.env.AUTO_LEARN_MODE = "min_sources";
    process.env.AUTO_LEARN_MIN_PROVISIONAL = "1";
    process.env.TRACE_ISO = "AA";

    process.chdir(tmpDir);

    writeJson(path.join(tmpDir, "data", "iso3166", "iso3166-1.json"), {
      entries: [{ alpha2: "AA" }]
    });
    writeJson(path.join(tmpDir, "data", "sources", "official_catalog.json"), {
      AA: { missing_official: true, medical: [], recreational: [] }
    });
    writeJson(path.join(tmpDir, "data", "sources", "allowlist_domains.json"), {
      allowed: ["example.gov"]
    });
    writeJson(path.join(tmpDir, "data", "sources", "domain_denylist.json"), {
      banned: []
    });
    writeJson(path.join(tmpDir, "data", "sources", "wikidata_candidates.json"), {
      candidates: { AA: ["https://example.gov/"] }
    });
    writeJson(path.join(tmpDir, "data", "sources", "sources_registry.json"), {
      AA: [{ title: "Official source", url: "https://example.gov/" }]
    });
    writeJson(path.join(tmpDir, "data", "laws", "world", "AA.json"), {
      id: "AA",
      review_status: "provisional"
    });
    const discoveryStub = path.join(
      tmpDir,
      "tools",
      "auto_learn",
      "wikidata_discovery.mjs"
    );
    fs.mkdirSync(path.dirname(discoveryStub), { recursive: true });
    fs.writeFileSync(discoveryStub, "process.exit(0);\n");
    const registryStub = path.join(
      tmpDir,
      "tools",
      "sources",
      "registry_from_catalog.mjs"
    );
    fs.mkdirSync(path.dirname(registryStub), { recursive: true });
    fs.writeFileSync(registryStub, "process.exit(0);\n");

    const links = Array.from({ length: 60 }, (_, idx) => {
      return `<a href=\"/laws/drug-act-${idx}\">Drug Law ${idx}</a>`;
    }).join("");
    const baseHtml = `<html><head><title>Portal</title></head><body>${links}</body></html>`;
    const candidateHtml =
      "<html><head><title>Drug Law</title></head><body><p>Section 1</p></body></html>";

    globalThis.fetch = async (url) => ({
      status: 200,
      url,
      headers: { get: () => "text/html" },
      arrayBuffer: async () => Buffer.from(url.includes("drug-act") ? candidateHtml : baseHtml)
    });

    const { runAutoLearn } = await import(
      `./run_auto_learn.mjs?cache=${Date.now()}`
    );
    await runAutoLearnWithExitHandled(runAutoLearn);

    const tracePath = path.join(tmpDir, "Reports", "auto_learn_law", "aa_trace.json");
    const trace = JSON.parse(fs.readFileSync(tracePath, "utf8"));
    assert.ok(typeof trace.start_url === "string");
    assert.ok(Number.isFinite(trace.found_links_count));
    assert.ok(Array.isArray(trace.top_links));
    assert.ok(Number(trace.pages_scanned) <= 30);
  } finally {
    process.chdir(prevCwd);
    globalThis.fetch = prevFetch;
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
