import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const REGISTRY_PATH = path.join(ROOT, "data", "sources_registry.json");
const SNAPSHOT_ROOT = path.join(ROOT, "data", "source_snapshots");
const REPORT_PATH = path.join(ROOT, "Reports", "sources", "fetch_sources_last.json");

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    registryPath: REGISTRY_PATH,
    outDir: SNAPSHOT_ROOT,
    fixturesDir: process.env.OFFLINE_FIXTURES_DIR || "",
    limit: 0,
    smoke: false
  };
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i + 1];
    if (args[i] === "--registry" && value) options.registryPath = value;
    if (args[i] === "--out" && value) options.outDir = value;
    if (args[i] === "--fixtures" && value) options.fixturesDir = value;
    if (args[i] === "--smoke") options.smoke = true;
    if (args[i] === "--limit" && value) {
      const parsed = Number(value);
      if (!Number.isNaN(parsed) && parsed > 0) options.limit = parsed;
    }
  }
  if (options.smoke) {
    options.registryPath = path.join(
      ROOT,
      "Reports",
      "sources",
      "registry_smoke.json"
    );
    options.outDir = path.join(
      ROOT,
      "Reports",
      "sources",
      "source_snapshots_smoke"
    );
    options.fixturesDir = path.join(ROOT, "tools", "sources", "fixtures");
    options.limit = 1;
  }
  return options;
}

function pickFixture(fixturesDir, iso2, kind) {
  if (!fixturesDir) return null;
  const candidates = [
    path.join(fixturesDir, `${iso2}_${kind}.html`),
    path.join(fixturesDir, `${iso2}_${kind}.pdf`),
    path.join(fixturesDir, `${iso2}.html`),
    path.join(fixturesDir, `${iso2}.pdf`)
  ];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) return filePath;
  }
  return null;
}

async function fetchSource(entry, fixturesDir) {
  if (fixturesDir) {
    const fixture = pickFixture(fixturesDir, entry.iso2, entry.kind);
    if (!fixture) return null;
    const data = fs.readFileSync(fixture);
    const ext = fixture.endsWith(".pdf") ? "pdf" : "html";
    return {
      ok: true,
      status: 200,
      etag: null,
      lastModified: null,
      contentType: ext === "pdf" ? "application/pdf" : "text/html",
      data
    };
  }
  const response = await fetch(entry.url, { method: "GET" });
  const contentType = response.headers.get("content-type") || "text/html";
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    ok: response.ok,
    status: response.status,
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
    contentType,
    data: buffer
  };
}

async function main() {
  const options = parseArgs();
  if (options.smoke) {
    fs.mkdirSync(path.dirname(options.registryPath), { recursive: true });
    fs.writeFileSync(
      options.registryPath,
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
      ) + "\n"
    );
  } else if (!fs.existsSync(options.registryPath)) {
    fail(`Missing ${options.registryPath}`);
  }
  const registry = readJson(options.registryPath) || {};
  const items = Array.isArray(registry.ssot_sources)
    ? registry.ssot_sources
    : [];
  if (items.length === 0) {
    console.log("No ssot_sources to fetch.");
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const report = {
    generated_at: new Date().toISOString(),
    total: 0,
    success: 0,
    failed: 0,
    pending: 0
  };

  const limit = options.limit > 0 ? options.limit : items.length;
  for (const entry of items.slice(0, limit)) {
    report.total += 1;
    const iso2 = String(entry.iso2 || "").toUpperCase();
    if (!iso2) {
      report.failed += 1;
      continue;
    }
    let response;
    try {
      response = await fetchSource(entry, options.fixturesDir);
    } catch {
      report.pending += 1;
      continue;
    }
    if (!response || !response.ok) {
      report.failed += 1;
      continue;
    }
    const ext = response.contentType.includes("pdf") ? "pdf" : "html";
    const hash = sha256(response.data);
    const dayDir = path.join(options.outDir, iso2, today);
    fs.mkdirSync(dayDir, { recursive: true });
    const baseName =
      typeof entry.fixed_name === "string" && entry.fixed_name.trim()
        ? entry.fixed_name.trim()
        : hash;
    const snapshotPath = path.join(dayDir, `${baseName}.${ext}`);
    fs.writeFileSync(snapshotPath, response.data);

    const metaPath = path.join(dayDir, "meta.json");
    const meta = fs.existsSync(metaPath)
      ? JSON.parse(fs.readFileSync(metaPath, "utf8"))
      : { generated_at: new Date().toISOString(), items: [] };
    const finalUrl =
      typeof entry.final_url === "string" && entry.final_url.trim()
        ? entry.final_url.trim()
        : entry.url;
    meta.hash = hash;
    meta.http_status = response.status;
    meta.final_url = finalUrl;
    meta.snapshot = snapshotPath;
    meta.items.push({
      iso2,
      kind: entry.kind || "general",
      type: entry.type || "candidate",
      url: entry.url,
      final_url: finalUrl,
      status: response.status,
      http_status: response.status,
      etag: response.etag,
      last_modified: response.lastModified,
      sha256: hash,
      hash,
      snapshot: snapshotPath,
      retrieved_at: new Date().toISOString()
    });
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
    report.success += 1;
  }

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");
  console.log(
    `OK fetch_sources (total=${report.total}, success=${report.success}, failed=${report.failed}, pending=${report.pending})`
  );
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
});
