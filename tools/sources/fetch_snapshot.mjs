import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const SNAPSHOT_ROOT = path.join(ROOT, "data", "source_snapshots");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    iso2: "",
    url: "",
    outDir: SNAPSHOT_ROOT,
    reportPath: ""
  };
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i + 1];
    if (args[i] === "--iso2" && value) options.iso2 = value;
    if (args[i] === "--url" && value) options.url = value;
    if (args[i] === "--out" && value) options.outDir = value;
    if (args[i] === "--report" && value) options.reportPath = value;
  }
  return options;
}

const DEFAULT_UA =
  "Mozilla/5.0 (compatible; islegalcannabis/auto_learn; +https://islegalcannabis.com)";

async function fetchWithFallback(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      "user-agent": DEFAULT_UA,
      accept: "text/html,application/pdf;q=0.9,*/*;q=0.8"
    };
    const headResponse = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers
    });
    const headStatus = Number(headResponse?.status || 0);
    if (headResponse && headStatus >= 200 && headStatus < 400) {
      return await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers
      });
    }
    return await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const options = parseArgs();
  const iso2 = String(options.iso2 || "").toUpperCase();
  const url = String(options.url || "");
  if (!iso2 || !url) {
    console.error("ERROR: missing --iso2 or --url");
    process.exit(1);
  }

  let response;
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetchWithFallback(url, 8000 + attempt * 2000);
    } catch (error) {
      lastError = error;
    }
    const status = Number(response?.status || 0);
    if (status === 403 || status === 429) {
      const delay = attempt === 0 ? 500 : 1200;
      const buffer = new SharedArrayBuffer(4);
      const view = new Int32Array(buffer);
      Atomics.wait(view, 0, 0, delay);
      continue;
    }
    if (response) break;
  }
  if (!response) {
    const reason = lastError?.name === "AbortError" ? "TIMEOUT" : "FETCH_ERROR";
    if (options.reportPath) {
      fs.mkdirSync(path.dirname(options.reportPath), { recursive: true });
      fs.writeFileSync(
        options.reportPath,
        JSON.stringify(
          {
            url,
            status: 0,
            content_type: "",
            bytes: 0,
            sha256: "",
            ok: false,
            reason
          },
          null,
          2
        ) + "\n"
      );
    }
    process.exit(2);
  }
  const status = Number(response?.status || 0);
  const finalUrl = response?.url || url;
  if (!response || status < 200 || status >= 400) {
    if (options.reportPath) {
      fs.mkdirSync(path.dirname(options.reportPath), { recursive: true });
      fs.writeFileSync(
        options.reportPath,
        JSON.stringify(
          {
            url,
            status,
            content_type: "",
            bytes: 0,
            sha256: "",
            ok: false,
            reason: "BAD_STATUS"
          },
          null,
          2
        ) + "\n"
      );
    }
    console.error(`SNAPSHOT_DIAG url=${url} status=${status || 0} ctype= size=0 sha=`);
    process.exit(2);
  }

  const contentType = response.headers.get("content-type") || "";
  const buffer = Buffer.from(await response.arrayBuffer());
  const size = buffer.length;
  const emptyHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  const hash = sha256(buffer);
  const ctype = contentType.toLowerCase();
  const isPdf =
    ctype.includes("application/pdf") ||
    (url.toLowerCase().endsWith(".pdf") &&
      (ctype.includes("octet-stream") || ctype === ""));
  const isHtml = ctype.includes("text/html") || ctype.includes("text/plain");
  if (!isHtml && !isPdf) {
    if (options.reportPath) {
      fs.mkdirSync(path.dirname(options.reportPath), { recursive: true });
      fs.writeFileSync(
        options.reportPath,
        JSON.stringify(
          {
            url,
            status,
            content_type: contentType,
            bytes: size,
            sha256: hash,
            ok: false,
            reason: "BAD_CONTENT_TYPE"
          },
          null,
          2
        ) + "\n"
      );
    }
    console.error(
      `SNAPSHOT_DIAG url=${url} status=${status} ctype=${contentType} size=${size} sha=${hash}`
    );
    process.exit(4);
  }
  if (size < 1) {
    if (options.reportPath) {
      fs.mkdirSync(path.dirname(options.reportPath), { recursive: true });
      fs.writeFileSync(
        options.reportPath,
        JSON.stringify(
          {
            url,
            status,
            content_type: contentType,
            bytes: size,
            sha256: hash,
            ok: false,
            reason: "TOO_SMALL"
          },
          null,
          2
        ) + "\n"
      );
    }
    console.error(
      `SNAPSHOT_DIAG url=${url} status=${status} ctype=${contentType} size=${size} sha=${hash}`
    );
    process.exit(5);
  }
  if (hash === emptyHash) {
    if (options.reportPath) {
      fs.mkdirSync(path.dirname(options.reportPath), { recursive: true });
      fs.writeFileSync(
        options.reportPath,
        JSON.stringify(
          {
            url,
            status,
            content_type: contentType,
            bytes: size,
            sha256: hash,
            ok: false,
            reason: "EMPTY_HASH"
          },
          null,
          2
        ) + "\n"
      );
    }
    console.error(
      `SNAPSHOT_DIAG url=${url} status=${status} ctype=${contentType} size=${size} sha=${hash}`
    );
    process.exit(6);
  }
  const ext = isPdf ? "pdf" : "html";
  const today = new Date().toISOString().slice(0, 10);
  const dayDir = path.join(options.outDir, iso2, today);
  fs.mkdirSync(dayDir, { recursive: true });
  const snapshotPath = path.join(dayDir, `${hash}.${ext}`);
  fs.writeFileSync(snapshotPath, buffer);

  const metaPath = path.join(dayDir, "meta.json");
  const meta = fs.existsSync(metaPath)
    ? JSON.parse(fs.readFileSync(metaPath, "utf8"))
    : { generated_at: new Date().toISOString(), items: [] };
  meta.iso2 = iso2;
  meta.url = url;
  meta.final_url = finalUrl;
  meta.status = status;
  meta.hash = hash;
  meta.content_hash = hash;
  meta.bytes = size;
  meta.content_type = contentType || "unknown";
  meta.run_id = process.env.RUN_ID || meta.run_id || "";
  meta.retrieved_at = new Date().toISOString();
  meta.items = Array.isArray(meta.items) ? meta.items : [];
  meta.items.push({
    iso2,
    url,
    final_url: finalUrl,
    status,
    sha256: hash,
    content_hash: hash,
    snapshot: snapshotPath,
    bytes: size,
    content_type: contentType || "unknown",
    retrieved_at: meta.retrieved_at,
    run_id: process.env.RUN_ID || ""
  });
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");

  if (options.reportPath) {
    fs.mkdirSync(path.dirname(options.reportPath), { recursive: true });
    fs.writeFileSync(
      options.reportPath,
      JSON.stringify(
        {
          url,
          final_url: finalUrl,
          status,
          content_type: contentType,
          bytes: size,
          sha256: hash,
          content_hash: hash,
          ok: true,
          reason: "OK",
          snapshot_path: snapshotPath
        },
        null,
        2
      ) + "\n"
    );
  }
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
});
