import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const DEFAULT_REGISTRY_PATH = path.join(ROOT, "data", "sources_registry.json");
const DEFAULT_OUT_DIR = path.join(ROOT, "data", "source_snapshots");
const REPORT_PATH = path.join(ROOT, "Reports", "sources", "fetch_snapshots.json");

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    registryPath: DEFAULT_REGISTRY_PATH,
    outDir: DEFAULT_OUT_DIR,
    fixturesDir: process.env.OFFLINE_FIXTURES_DIR || ""
  };
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i + 1];
    if (args[i] === "--registry" && value) options.registryPath = value;
    if (args[i] === "--out" && value) options.outDir = value;
    if (args[i] === "--fixtures" && value) options.fixturesDir = value;
  }
  return options;
}

function pickFixture(fixturesDir, iso2) {
  if (!fixturesDir) return null;
  const candidates = [
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
    const fixture = pickFixture(fixturesDir, entry.iso2);
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

function collectExistingSnapshots(outDir) {
  if (!fs.existsSync(outDir)) return 0;
  let count = 0;
  const isoDirs = fs.readdirSync(outDir);
  for (const iso2 of isoDirs) {
    const isoPath = path.join(outDir, iso2);
    if (!fs.statSync(isoPath).isDirectory()) continue;
    for (const dayDir of fs.readdirSync(isoPath)) {
      const dayPath = path.join(isoPath, dayDir);
      if (!fs.statSync(dayPath).isDirectory()) continue;
      count += fs
        .readdirSync(dayPath)
        .filter((file) => file.endsWith(".html") || file.endsWith(".pdf")).length;
    }
  }
  return count;
}

async function main() {
  const options = parseArgs();
  if (!fs.existsSync(options.registryPath)) {
    fail(`Missing ${options.registryPath}`);
  }
  const registry = readJson(options.registryPath) || {};
  const entries = Array.isArray(registry.ssot_entries)
    ? registry.ssot_entries
    : [];
  const report = {
    generated_at: new Date().toISOString(),
    network: process.env.NETWORK === "1",
    total: entries.length,
    success: 0,
    failed: 0,
    pending: 0,
    skipped_offline: 0,
    success_ids: [],
    failed_ids: [],
    skipped_offline_ids: [],
    existing_snapshots: collectExistingSnapshots(options.outDir)
  };

  if (process.env.NETWORK !== "1") {
    report.skipped_offline = entries.length;
    report.skipped_offline_ids = entries.map((entry) => entry.iso2.toUpperCase());
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");
    console.log("OK fetch_snapshots (offline)");
    return;
  }

  const dayDirName = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  for (const entry of entries) {
    try {
      const response = await fetchSource(entry, options.fixturesDir);
      if (!response || !response.ok) {
        report.failed += 1;
        report.failed_ids.push(entry.iso2.toUpperCase());
        continue;
      }
      const ext = response.contentType.includes("pdf") ? "pdf" : "html";
      const hash = sha256(response.data);
      const isoDir = path.join(options.outDir, entry.iso2.toUpperCase(), dayDirName);
      fs.mkdirSync(isoDir, { recursive: true });
      const snapshotPath = path.join(isoDir, `${hash}.${ext}`);
      fs.writeFileSync(snapshotPath, response.data);
      const metaPath = path.join(isoDir, "meta.json");
      const meta = fs.existsSync(metaPath)
        ? JSON.parse(fs.readFileSync(metaPath, "utf8"))
        : { items: [] };
      meta.items.push({
        iso2: entry.iso2.toUpperCase(),
        url: entry.url,
        status: response.status,
        retrieved_at: new Date().toISOString(),
        etag: response.etag,
        last_modified: response.lastModified,
        sha256: hash,
        snapshot: snapshotPath
      });
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
      report.success += 1;
      report.success_ids.push(entry.iso2.toUpperCase());
    } catch {
      report.pending += 1;
      report.failed_ids.push(entry.iso2.toUpperCase());
    }
  }

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");
  console.log(
    `OK fetch_snapshots (total=${report.total}, success=${report.success})`
  );
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
});
