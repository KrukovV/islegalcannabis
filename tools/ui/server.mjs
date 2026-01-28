import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import url from "node:url";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const cliPort = portIndex >= 0 ? Number(args[portIndex + 1]) : NaN;
const PORT = Number.isFinite(cliPort)
  ? cliPort
  : Number(process.env.PORT || process.env.UI_PORT || 5173);
const CLAIMS_MAP_PATH = path.join(ROOT, "data", "wiki", "wiki_claims_map.json");
const OFFICIAL_EVAL_PATH = path.join(ROOT, "data", "wiki", "wiki_official_eval.json");
const PER_GEO_DIR = path.join(ROOT, "data", "wiki", "wiki_claims");

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function serveJson(res, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function serveNotFound(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
}

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Wiki SSOT Browser</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; margin: 24px; color: #111; }
      h1 { margin: 0 0 12px; }
      input { padding: 8px 10px; font-size: 14px; width: 240px; }
      .row { display: flex; gap: 16px; margin: 12px 0; flex-wrap: wrap; }
      .card { border: 1px solid #ddd; padding: 12px; border-radius: 8px; width: 320px; }
      .muted { color: #666; font-size: 12px; }
      pre { background: #f7f7f7; padding: 12px; overflow: auto; }
    </style>
  </head>
  <body>
    <h1>Wiki SSOT Browser</h1>
    <div class="muted">Read-only view of data/wiki SSOT.</div>
    <div class="row">
      <input id="geoInput" placeholder="Geo (e.g., RU, US-CA)" />
      <button id="loadBtn">Load</button>
    </div>
    <div id="summary" class="row"></div>
    <pre id="details">Select a geo to view details.</pre>
    <script>
      const summary = document.getElementById("summary");
      const details = document.getElementById("details");
      const input = document.getElementById("geoInput");
      document.getElementById("loadBtn").addEventListener("click", () => loadGeo(input.value.trim().toUpperCase()));

      async function loadGeo(geo) {
        if (!geo) return;
        const res = await fetch("/api/geo/" + encodeURIComponent(geo));
        if (!res.ok) {
          details.textContent = "Geo not found: " + geo;
          return;
        }
        const data = await res.json();
        const evalRes = await fetch("/api/official_eval");
        const evalData = await evalRes.json();
        const evalEntry = (evalData.items || {})[geo] || {};
        summary.innerHTML = \`
          <div class="card">
            <strong>\${geo}</strong>
            <div>rec: \${data.recreational_status || data.wiki_rec || "Unknown"}</div>
            <div>med: \${data.medical_status || data.wiki_med || "Unknown"}</div>
            <div>revision: \${data.wiki_revision_id || data.revision_id || "-"}</div>
            <div>sources_total: \${evalEntry.sources_total ?? 0}</div>
            <div>official_badge: \${evalEntry.official_badge ?? 0}</div>
            <div class="muted">notes_len: \${data.notes_text_len ?? (data.notes ? data.notes.length : 0)}</div>
          </div>\`;
        details.textContent = JSON.stringify({ claim: data, official_eval: evalEntry }, null, 2);
      }
    </script>
  </body>
</html>`;

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url || "/", true);
  const pathname = parsed.pathname || "/";
  if (pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }
  if (pathname === "/api/claims_map") {
    const payload = readJson(CLAIMS_MAP_PATH, { items: {} });
    serveJson(res, payload);
    return;
  }
  if (pathname === "/api/official_eval") {
    const payload = readJson(OFFICIAL_EVAL_PATH, { items: {} });
    serveJson(res, payload);
    return;
  }
  if (pathname.startsWith("/api/geo/")) {
    const geo = pathname.replace("/api/geo/", "").toUpperCase();
    const filePath = path.join(PER_GEO_DIR, geo + ".json");
    const payload = readJson(filePath, null);
    if (!payload) return serveNotFound(res);
    serveJson(res, payload);
    return;
  }
  serveNotFound(res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`OPEN_URL=http://127.0.0.1:${PORT}/`);
});
