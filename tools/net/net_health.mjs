import { execSync, spawnSync } from "node:child_process";
import dns from "node:dns/promises";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const API_URL = "https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json";
const FALLBACK_URL = "https://www.wikipedia.org/";
const CONNECT_TARGET = { host: "1.1.1.1", port: 443 };
const TIMEOUT_MS = Number(process.env.NET_HEALTH_TIMEOUT_MS || 4000);
const RETRIES = Number(process.env.NET_HEALTH_RETRIES || 1);
const DNS_TIMEOUT_MS = Number(process.env.NET_HEALTH_DNS_TIMEOUT_MS || 1500);

const DIAG = process.argv.includes("--diag");
const JSON_MODE = process.argv.includes("--json");
const CACHE_PATH = process.env.NET_PROBE_CACHE_PATH || "";

function readProbeCache() {
  if (!CACHE_PATH) return null;
  if (!fs.existsSync(CACHE_PATH)) return null;
  try {
    const raw = fs.readFileSync(CACHE_PATH, "utf8");
    const cached = JSON.parse(raw);
    if (!("cache_hit" in cached)) cached.cache_hit = 1;
    cached.source = "CACHE_FILE";
    if (!("connect_reason" in cached)) cached.connect_reason = "CONNECT_ERROR";
    if (!("connect_err_raw" in cached) && "connect_err" in cached) cached.connect_err_raw = cached.connect_err;
    if (!("connect_err_raw" in cached)) cached.connect_err_raw = "UNKNOWN";
    if (!("dns_diag_reason" in cached)) cached.dns_diag_reason = cached.dns_err && cached.dns_err !== "NONE" ? "DNS_DIAG" : "NONE";
    if (!("dns_diag_hint" in cached)) cached.dns_diag_hint = "dns is diagnostic only";
    if (!("source" in cached)) cached.source = "CACHE_FILE";
    return cached;
  } catch {
    return null;
  }
}

function writeProbeCache(payload) {
  if (!CACHE_PATH) return;
  try {
    const dir = path.dirname(CACHE_PATH);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${CACHE_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload));
    fs.renameSync(tmp, CACHE_PATH);
  } catch {
  }
}

function extractNameserver(output) {
  const match = output.match(/nameserver\[\d+\]\s*:\s*([^\s]+)/);
  if (match && match[1]) return match[1].trim();
  const resolvMatch = output.match(/nameserver\s+([^\s]+)/);
  if (resolvMatch && resolvMatch[1]) return resolvMatch[1].trim();
  return "";
}

function isPrivateIp(ip) {
  if (!ip) return false;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  const parts = ip.split(".");
  if (parts.length === 4 && parts[0] === "172") {
    const second = Number(parts[1]);
    return Number.isFinite(second) && second >= 16 && second <= 31;
  }
  return false;
}

function getDnsNameserver() {
  let scutilEmpty = false;
  let resolvEmpty = false;
  try {
    const output = execSync("scutil --dns", { encoding: "utf8" });
    if (output.includes("No DNS configuration available")) {
      scutilEmpty = true;
    }
    const found = extractNameserver(output);
    if (found) return { ns: found, scutilEmpty };
  } catch {
  }
  const services = ["Wi-Fi", "Ethernet", "Thunderbolt Ethernet", "USB 10/100/1000 LAN"];
  for (const service of services) {
    try {
      const output = execSync(`networksetup -getdnsservers "${service}"`, { encoding: "utf8" });
      if (!output.includes("There aren't any DNS Servers set")) {
        const line = output.trim().split("\n")[0]?.trim();
        if (line && !line.includes("AuthorizationCreate")) {
          const ipOk = /^[0-9a-fA-F:.]+$/.test(line);
          if (ipOk) return { ns: line, scutilEmpty };
        }
      }
    } catch {
      continue;
    }
  }
  try {
    const resolv = execSync("cat /etc/resolv.conf", { encoding: "utf8" });
    if (!/nameserver\s+\S+/.test(resolv)) resolvEmpty = true;
    const found = extractNameserver(resolv);
    if (found) return { ns: found, scutilEmpty, resolvEmpty };
  } catch {
  }
  return { ns: "UNKNOWN", scutilEmpty, resolvEmpty: true };
}

function checkDigBlocked() {
  const result = spawnSync("dig", ["+time=2", "+tries=1", "en.wikipedia.org", "A", "+short"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.error) {
    if (String(result.error?.code || "") === "ENOENT") {
      return { blocked: false, err: "NO_DIG" };
    }
    if (String(result.error?.code || "") === "EPERM") {
      return { blocked: true, err: "EPERM" };
    }
  }
  const stderr = String(result.stderr || "");
  if (stderr.includes("Operation not permitted")) {
    return { blocked: true, err: "EPERM" };
  }
  if (result.status !== 0) {
    return { blocked: false, err: "UNKNOWN" };
  }
  return { blocked: false, err: "NONE" };
}

async function checkDns(hostname) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DNS_TIMEOUT_MS);
  try {
    await dns.lookup(hostname, { signal: controller.signal });
    clearTimeout(timer);
    return { ok: true, err: "NONE", blocked: false };
  } catch (error) {
    clearTimeout(timer);
    const errCode = String(error?.code || error?.name || "UNKNOWN");
    const blocked = errCode === "ECONNREFUSED" || errCode === "EPERM";
    return { ok: false, err: errCode, blocked };
  }
}

function classifyProbeError(message) {
  const msg = String(message || "");
  if (msg.includes("Could not resolve host")) return "DNS";
  if (msg.includes("timed out")) return "TIMEOUT";
  if (msg.includes("SSL") || msg.includes("TLS")) return "TLS";
  return "HTTP";
}

async function probeWithFetch(url, expectJson) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch(url, { method: "GET", signal: controller.signal });
    const rtt = Date.now() - start;
    clearTimeout(timer);
    const status = res.status;
    if (status >= 200 && status < 400) {
      if (expectJson) {
        try {
          await res.json();
        } catch {
          return { ok: false, status, reason: "HTTP_STATUS", err: "JSON_PARSE", rtt_ms: rtt };
        }
      }
      return { ok: true, status, reason: "OK", err: "NONE", rtt_ms: rtt };
    }
    return { ok: false, status, reason: "HTTP_STATUS", err: "HTTP", rtt_ms: rtt };
  } catch (error) {
    clearTimeout(timer);
    const code = String(error?.cause?.code || error?.code || error?.name || "UNKNOWN");
    if (code.includes("EPERM") || code.includes("EACCES")) {
      return { ok: false, status: "-", reason: "CONNECT_POLICY", err: code, rtt_ms: Date.now() - start };
    }
    if (code.includes("ENOTFOUND") || code.includes("EAI_AGAIN")) {
      return { ok: false, status: "-", reason: "DNS", err: code, rtt_ms: Date.now() - start };
    }
    if (code.includes("CERT") || code.includes("TLS") || code.includes("SSL")) {
      return { ok: false, status: "-", reason: "TLS", err: code, rtt_ms: Date.now() - start };
    }
    if (code.includes("AbortError")) {
      return { ok: false, status: "-", reason: "TIMEOUT", err: code, rtt_ms: Date.now() - start };
    }
    if (code.includes("ECONNREFUSED")) {
      return { ok: false, status: "-", reason: "CONN_REFUSED", err: code, rtt_ms: Date.now() - start };
    }
    if (code.includes("ENETUNREACH") || code.includes("EHOSTUNREACH")) {
      return { ok: false, status: "-", reason: "NO_ROUTE", err: code, rtt_ms: Date.now() - start };
    }
    return { ok: false, status: "-", reason: "HTTP", err: code, rtt_ms: Date.now() - start };
  }
}

async function probeFallbackIp() {
  const targets = ["http://1.1.1.1/cdn-cgi/trace", "http://8.8.8.8", "http://9.9.9.9"];
  let last = { ok: false, status: "-", reason: "HTTP", err: "NO_TARGETS", rtt_ms: "-" };
  for (const target of targets) {
    const probe = await probeWithFetch(target, false);
    if (probe.ok) {
      return { ...probe, target };
    }
    last = { ...probe, target };
  }
  return last;
}

async function tcpProbe(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: TIMEOUT_MS }, () => {
      socket.end();
      resolve({ ok: true, err: "NONE", reason: "OK" });
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ ok: false, err: "TIMEOUT", reason: "TIMEOUT" });
    });
    socket.on("error", (error) => {
      socket.destroy();
      const code = String(error?.code || error?.name || "UNKNOWN");
      let reason = "CONNECT_ERROR";
      if (code === "EPERM" || code === "EACCES") reason = "SANDBOX_EGRESS_BLOCKED";
      else if (code === "ENETUNREACH" || code === "EHOSTUNREACH" || code === "ENETDOWN") reason = "NO_NETWORK";
      else if (code === "ETIMEDOUT") reason = "TIMEOUT";
      else if (code === "ECONNREFUSED") reason = "REFUSED";
      resolve({ ok: false, err: code, reason });
    });
  });
}

async function main() {
  const cached = readProbeCache();
  if (cached) {
    const ok = Boolean(cached.http_ok || cached.api_ok || cached.connect_ok || cached.fallback_ok);
    const source = cached.source || "CACHE_FILE";
    const dnsDiagReason = cached.dns_diag_reason || (cached.dns_err && cached.dns_err !== "NONE" ? "DNS_DIAG" : "NONE");
    const dnsDiagHint = cached.dns_diag_hint || "dns is diagnostic only";
    if (JSON_MODE) {
      console.log(
        `NET_HTTP_PROBE json=${JSON.stringify({
          ...cached,
          cache_hit: cached.cache_hit ?? 1,
          source,
          dns_diag_reason: dnsDiagReason,
          dns_diag_hint: dnsDiagHint
        })}`
      );
    } else {
      console.log(
        `NET_DIAG_DNS ok=${cached.dns_ok ?? 0} err=${cached.dns_err ?? "UNKNOWN"} reason=${dnsDiagReason} hint=${dnsDiagHint} source=${source}`
      );
      console.log(
        `NET_HTTP_PROBE ok=${cached.http_ok ?? 0} target=${cached.target || FALLBACK_URL} status=${cached.http_status ?? "-"} reason=${cached.http_reason || "HTTP"} rtt_ms=${cached.rtt_ms ?? "-"} api_ok=${cached.api_ok ?? 0} api_status=${cached.api_status ?? "-"} api_reason=${cached.api_reason || "HTTP"} source=${source}`
      );
      console.log(
        `NET_FALLBACK_PROBE ok=${cached.fallback_ok ?? 0} target=${cached.fallback_target || "http://1.1.1.1/cdn-cgi/trace"} status=${cached.fallback_status ?? "-"} reason=${cached.fallback_reason || "HTTP"} source=${source}`
      );
    }
    if (DIAG) {
      console.log(`NET_HEALTH_EXIT=${ok ? 0 : 11}`);
    }
    process.exit(JSON_MODE ? 0 : (ok ? 0 : 11));
  }
  const dnsInfo = getDnsNameserver();
  const dnsNs = dnsInfo.ns;
  const dnsCheck = await checkDns("en.wikipedia.org");
  const dnsOk = dnsCheck.ok;
  const httpProbe = await probeWithFetch(FALLBACK_URL, false);
  const apiProbe = await probeWithFetch(API_URL, true);
  const fallbackProbe = await probeFallbackIp();
  const connectProbe = await tcpProbe(CONNECT_TARGET.host, CONNECT_TARGET.port);
  let dnsDiagReason = "NONE";
  let dnsDiagHint = "dns is diagnostic only";
  if (dnsNs === "UNKNOWN" && dnsInfo.resolvEmpty) {
    dnsDiagReason = "NO_DNS_CONFIG";
    dnsDiagHint = "resolver config missing or empty in sandbox";
  } else if (!dnsOk && (dnsCheck.err === "ENOTFOUND" || dnsCheck.err === "EAI_AGAIN") && isPrivateIp(dnsNs)) {
    dnsDiagReason = "SANDBOX_DNS_STUB";
    dnsDiagHint = "private resolver may be blocked or stubbed in sandbox";
  } else if (dnsOk && (httpProbe.reason === "DNS" || apiProbe.reason === "DNS")) {
    dnsDiagReason = "TOOLING_DNS_DIFF";
    dnsDiagHint = "node resolver ok, HTTP fetch DNS failed";
  } else if (!dnsOk && dnsCheck.err && dnsCheck.err !== "NONE") {
    dnsDiagReason = "DNS_DIAG";
  }
  const httpOk = httpProbe.ok;
  const apiOk = apiProbe.ok;
  const fallbackOk = fallbackProbe.ok;
  const connectOk = connectProbe.ok;
  const ok = httpOk || apiOk || fallbackOk || connectOk;
  const reason = ok ? "OK" : "HTTP_API_CONNECT_FALLBACK_FAIL";
  const payload = {
    ts: new Date().toISOString(),
    dns_ok: dnsOk ? 1 : 0,
    dns_err: dnsCheck.err || "NONE",
    dns_ns: dnsNs || "UNKNOWN",
    dns_diag_reason: dnsDiagReason,
    dns_diag_hint: dnsDiagHint,
    http_ok: httpOk ? 1 : 0,
    http_status: httpProbe.status || "-",
    http_reason: httpProbe.reason || "HTTP",
    api_ok: apiOk ? 1 : 0,
    api_status: apiProbe.status || "-",
    api_reason: apiProbe.reason || "HTTP",
    connect_ok: connectOk ? 1 : 0,
    connect_err_raw: connectProbe.err || "NONE",
    connect_reason: connectProbe.reason || "CONNECT_ERROR",
    connect_target: `${CONNECT_TARGET.host}:${CONNECT_TARGET.port}`,
    fallback_ok: fallbackOk ? 1 : 0,
    fallback_status: fallbackProbe.status || "-",
    fallback_reason: fallbackProbe.reason || "HTTP",
    fallback_target: fallbackProbe.target || "http://1.1.1.1/cdn-cgi/trace",
    cache_hit: 0,
    target: FALLBACK_URL,
    rtt_ms: httpProbe.rtt_ms ?? "-",
    source: "LIVE"
  };
  writeProbeCache(payload);
  if (JSON_MODE) {
    console.log(`NET_HTTP_PROBE json=${JSON.stringify(payload)}`);
  } else {
    console.log(
      `NET_DIAG_DNS ok=${payload.dns_ok} err=${payload.dns_err} reason=${payload.dns_diag_reason} hint=${payload.dns_diag_hint} source=${payload.source}`
    );
    console.log(
      `NET_HTTP_PROBE ok=${payload.http_ok} target=${FALLBACK_URL} status=${payload.http_status} reason=${payload.http_reason} rtt_ms=${httpProbe.rtt_ms ?? "-"} api_ok=${payload.api_ok} api_status=${payload.api_status} api_reason=${payload.api_reason} source=${payload.source}`
    );
    console.log(
      `NET_FALLBACK_PROBE ok=${payload.fallback_ok} target=${fallbackProbe.target} status=${payload.fallback_status} reason=${payload.fallback_reason} source=${payload.source}`
    );
  }
  if (DIAG) {
    console.log(`NET_HEALTH_EXIT=${ok ? 0 : 11}`);
  }
  process.exit(JSON_MODE ? 0 : (ok ? 0 : 11));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => {
    })
    .catch((error) => {
      const err = String(error?.message || "UNKNOWN");
      const dnsNs = getDnsNameserver();
      const payload = {
        dns_ok: 0,
        dns_err: err,
        dns_ns: dnsNs.ns || "UNKNOWN",
        dns_diag_reason: dnsNs.ns === "UNKNOWN" ? "NO_DNS_CONFIG" : "DNS_DIAG",
        dns_diag_hint: "dns is diagnostic only",
        http_ok: 0,
        http_status: "-",
        http_reason: "HTTP",
        api_ok: 0,
        api_status: "-",
        api_reason: "HTTP",
        connect_ok: 0,
        connect_err_raw: "UNKNOWN",
        connect_reason: "CONNECT_ERROR",
        connect_target: `${CONNECT_TARGET.host}:${CONNECT_TARGET.port}`,
        fallback_ok: 0,
        fallback_status: "-",
        fallback_reason: "HTTP",
        fallback_target: "http://1.1.1.1/cdn-cgi/trace",
        cache_hit: 0,
        target: API_URL
      };
      if (JSON_MODE) {
        console.log(`NET_HTTP_PROBE json=${JSON.stringify(payload)}`);
      } else {
        console.log(`NET_HEALTH ok=0 reason=HTTP detail=${err} target=${API_URL}`);
      }
  if (DIAG) {
        console.log("NET_HEALTH_EXIT=11");
      }
      process.exit(11);
    });
}
