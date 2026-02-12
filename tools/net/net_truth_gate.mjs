import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const META_PATH = path.join(ROOT, "data", "wiki", "wiki_claims.meta.json");
const MAX_CACHE_H = Number(process.env.WIKI_CACHE_MAX_AGE_H || 6);

function runNetHealth() {
  const result = spawnSync("node", ["tools/net/net_health.mjs", "--json"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env }
  });
  const stdout = String(result.stdout || "");
  const line = stdout.split("\n").find((entry) => entry.startsWith("NET_HTTP_PROBE json="));
  if (!line) {
    return { ok: false, payload: null };
  }
  try {
    const payload = JSON.parse(line.replace(/^NET_HTTP_PROBE json=/, ""));
    return { ok: true, payload };
  } catch {
    return { ok: false, payload: null };
  }
}

function readCacheInfo() {
  if (!fs.existsSync(META_PATH)) return { cache_ok: 0, cache_age_h: "-", max_cache_h: String(MAX_CACHE_H) };
  try {
    const meta = JSON.parse(fs.readFileSync(META_PATH, "utf8"));
    const fetchedAt = Date.parse(meta?.fetched_at || "");
    if (!fetchedAt) return { cache_ok: 0, cache_age_h: "-", max_cache_h: String(MAX_CACHE_H) };
    const age = (Date.now() - fetchedAt) / 36e5;
    const ok = Number.isFinite(age) && age <= MAX_CACHE_H;
    return { cache_ok: ok ? 1 : 0, cache_age_h: age.toFixed(2), max_cache_h: String(MAX_CACHE_H) };
  } catch {
    return { cache_ok: 0, cache_age_h: "-", max_cache_h: String(MAX_CACHE_H) };
  }
}

const net = runNetHealth();
const cacheInfo = readCacheInfo();
const allowNetwork = process.env.ALLOW_NETWORK ?? "1";
let fetchNetwork = process.env.FETCH_NETWORK ?? "1";
let overrideNetwork = process.env.OVERRIDE_NETWORK ?? "";
let sandboxEgress = 0;

const payload = net.payload || {
  dns_ok: 0,
  dns_err: "UNKNOWN",
  http_ok: 0,
  http_status: "-",
  http_reason: "HTTP",
  api_ok: 0,
  api_status: "-",
  api_reason: "HTTP",
  connect_ok: 0,
  connect_err: "UNKNOWN",
  connect_target: "1.1.1.1:443",
  fallback_ok: 0,
  fallback_status: "-",
  fallback_reason: "HTTP",
  fallback_target: "http://1.1.1.1/cdn-cgi/trace"
};

const truthOk = payload.http_ok === 1 || payload.api_ok === 1 || payload.connect_ok === 1 || payload.fallback_ok === 1;
if (payload.connect_reason === "SANDBOX_EGRESS_BLOCKED") {
  sandboxEgress = 1;
  fetchNetwork = "0";
  overrideNetwork = "0";
}
const online = truthOk ? 1 : 0;
const netMode = online === 1 ? "ONLINE" : (cacheInfo.cache_ok === 1 ? "DEGRADED_CACHE" : "OFFLINE");
const onlineReason = truthOk ? "OK" : "HTTP_API_CONNECT_FALLBACK_FAIL";

const diagPayload = {
  dns_ok: payload.dns_ok,
  dns_err: payload.dns_err,
  http_ok: payload.http_ok,
  http_status: payload.http_status,
  api_ok: payload.api_ok,
  api_status: payload.api_status,
  connect_ok: payload.connect_ok,
  fallback_ok: payload.fallback_ok,
  cache_hit: payload.cache_hit ?? 0,
  cache_ok: cacheInfo.cache_ok,
  cache_age_h: cacheInfo.cache_age_h,
  max_cache_h: cacheInfo.max_cache_h,
  allow_network: allowNetwork,
  fetch_network: fetchNetwork,
  override_network: overrideNetwork,
  sandbox_egress: sandboxEgress
};

console.log(
  `EGRESS_TRUTH http_ok=${payload.http_ok} api_ok=${payload.api_ok} connect_ok=${payload.connect_ok} fallback_ok=${payload.fallback_ok} online=${online} net_mode=${netMode}`
);
console.log(`NET_DIAG json=${JSON.stringify(diagPayload)}`);
console.log(`ONLINE_REASON=${onlineReason}`);
console.log("NET_TRUTH_GATE_OK=1");
process.exit(0);
