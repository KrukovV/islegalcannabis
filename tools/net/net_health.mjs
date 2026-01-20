import { execSync } from "node:child_process";
import dns from "node:dns/promises";
import net from "node:net";

const API_URL = "https://example.com/";
const FALLBACK_URL = "https://www.wikipedia.org/";
const TIMEOUT_MS = Number(process.env.NET_HEALTH_TIMEOUT_MS || 4000);
const RETRIES = Number(process.env.NET_HEALTH_RETRIES || 1);
const DNS_TIMEOUT_MS = Number(process.env.NET_HEALTH_DNS_TIMEOUT_MS || 1500);

const DIAG = process.argv.includes("--diag");

function extractNameserver(output) {
  const match = output.match(/nameserver\[\d+\]\s*:\s*([^\s]+)/);
  if (match && match[1]) return match[1].trim();
  const resolvMatch = output.match(/nameserver\s+([^\s]+)/);
  if (resolvMatch && resolvMatch[1]) return resolvMatch[1].trim();
  return "";
}

function getDnsNameserver() {
  let scutilEmpty = false;
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
    const found = extractNameserver(resolv);
    if (found) return { ns: found, scutilEmpty };
  } catch {
  }
  return { ns: "UNKNOWN", scutilEmpty };
}

async function checkDns(hostname) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DNS_TIMEOUT_MS);
  try {
    await dns.lookup(hostname, { signal: controller.signal });
    clearTimeout(timer);
    return { ok: true, err: "NONE" };
  } catch (error) {
    clearTimeout(timer);
    const errCode = String(error?.code || error?.name || "UNKNOWN");
    return { ok: false, err: errCode };
  }
}

function classifyProbeError(message) {
  const msg = String(message || "");
  if (msg.includes("Could not resolve host")) return "DNS";
  if (msg.includes("timed out")) return "TIMEOUT";
  if (msg.includes("SSL") || msg.includes("TLS")) return "TLS";
  return "HTTP";
}

async function probeWithCurl(url) {
  try {
    const output = execSync(`/usr/bin/curl -I -m 3 -s -o /dev/null -w "%{http_code}" ${url}`, {
      encoding: "utf8"
    });
    const code = output.trim();
    if (code && code !== "000") {
      const status = Number(code);
      if (status >= 200 && status < 400) {
        return { ok: true, status: code, reason: "OK", err: "NONE" };
      }
      return { ok: false, status: code, reason: "HTTP", err: "NONE" };
    }
    return { ok: false, status: "-", reason: "HTTP", err: "NONE" };
  } catch (error) {
    const message = String(error?.message || "");
    return {
      ok: false,
      status: "-",
      reason: classifyProbeError(message),
      err: message ? "CURL" : "UNKNOWN"
    };
  }
}

async function tcpProbe(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: TIMEOUT_MS }, () => {
      socket.end();
      resolve({ ok: true, err: "NONE" });
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ ok: false, err: "TIMEOUT" });
    });
    socket.on("error", (error) => {
      socket.destroy();
      resolve({ ok: false, err: String(error?.code || error?.name || "UNKNOWN") });
    });
  });
}

async function main() {
  const dnsInfo = getDnsNameserver();
  const dnsNs = dnsInfo.ns;
  const dnsCheck = await checkDns("example.com");
  const dnsOk = dnsCheck.ok;
  let last = null;
  let probeUrl = API_URL;
  let probeOk = false;
  let probeStatus = "-";
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    const result = await probeWithCurl(API_URL);
    last = result;
    if (result.ok) {
      probeOk = true;
      probeStatus = result.status;
      probeUrl = API_URL;
      break;
    }
  }
  if (!probeOk) {
    const fallback = await probeWithCurl(FALLBACK_URL);
    last = fallback;
    probeUrl = FALLBACK_URL;
    probeOk = fallback.ok;
    probeStatus = fallback.status;
  }
  let tcpOk = false;
  if (!probeOk) {
    const tcpResult = await tcpProbe("example.com", 443);
    tcpOk = tcpResult.ok;
  }
  const online = dnsOk && (probeOk || tcpOk);
  let reason = "OK";
  if (!online) {
    if (!dnsOk) {
      reason = "DNS";
    } else if (!probeOk && !tcpOk) {
      reason = last?.reason || "HTTP";
    }
  }
  let exit = 0;
  if (!online) {
    exit = 11;
    if (reason === "DNS") exit = 10;
    if (reason === "TLS") exit = 11;
    if (reason === "TIMEOUT") exit = 13;
  }
  console.log(
    `NET_HEALTH online=${online ? 1 : 0} dns_ok=${dnsOk ? 1 : 0} https_ok=${probeOk ? 1 : 0} tcp_ok=${tcpOk ? 1 : 0} dns_ns=${dnsNs} reason=${reason}`
  );
  if (DIAG) {
    console.log(`NET_HEALTH_EXIT=${exit}`);
  }
  process.exit(exit);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => {
    })
    .catch((error) => {
      const err = String(error?.message || "UNKNOWN");
      const dnsNs = getDnsNameserver();
      console.log(
        `NET_HEALTH online=0 dns_ok=0 https_ok=0 tcp_ok=0 dns_ns=${dnsNs} reason=HTTP`
      );
      if (DIAG) {
        console.log("NET_HEALTH_EXIT=12");
      }
      process.exit(12);
    });
}
