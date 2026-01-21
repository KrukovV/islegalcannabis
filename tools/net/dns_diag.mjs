import { execSync } from "node:child_process";
import dns from "node:dns/promises";
import fs from "node:fs";

const JSON_MODE = process.argv.includes("--json");
const DOMAINS = ["en.wikipedia.org", "www.wikipedia.org"];

function readResolvConf() {
  try {
    return fs.readFileSync("/etc/resolv.conf", "utf8");
  } catch {
    return "";
  }
}

function parseNameservers(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("nameserver"))
    .map((line) => line.split(/\s+/)[1])
    .filter(Boolean);
}

function getScutilDns() {
  try {
    return execSync("scutil --dns", { encoding: "utf8" });
  } catch {
    return "";
  }
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

async function resolveDomain(domain) {
  try {
    const addrs = await dns.resolve4(domain);
    return { ok: true, addrs, err: "NONE" };
  } catch (error) {
    const err = String(error?.code || error?.name || "UNKNOWN");
    return { ok: false, addrs: [], err };
  }
}

function classifyDnsMode(results, nameservers) {
  if (nameservers.length === 0) {
    return { mode: "NO_RESOLVER", err: "NO_NAMESERVER" };
  }
  const oks = results.filter((r) => r.ok).length;
  const fails = results.length - oks;
  if (oks === results.length) return { mode: "RESOLVES", err: "NONE" };
  if (oks > 0) return { mode: "PARTIAL", err: "PARTIAL" };
  const firstErr = results.find((r) => r.err && r.err !== "NONE")?.err || "UNKNOWN";
  return { mode: "BLOCKED", err: firstErr };
}

function classifyDiagReason(mode, err, nameservers) {
  if (mode === "NO_RESOLVER") {
    return { reason: "NO_DNS_CONFIG", hint: "resolver config missing or empty in sandbox" };
  }
  if ((err === "ENOTFOUND" || err === "EAI_AGAIN") && nameservers.some(isPrivateIp)) {
    return { reason: "SANDBOX_DNS_STUB", hint: "private resolver may be blocked or stubbed in sandbox" };
  }
  if (mode === "BLOCKED") {
    return { reason: "DNS_BLOCKED", hint: "dns failures are diagnostic only" };
  }
  return { reason: "DNS_OK", hint: "dns is diagnostic only" };
}

async function main() {
  const resolvConf = readResolvConf();
  const nameservers = parseNameservers(resolvConf);
  const scutil = getScutilDns();
  const results = {};
  for (const domain of DOMAINS) {
    results[domain] = await resolveDomain(domain);
  }
  const summary = classifyDnsMode(Object.values(results), nameservers);
  const diag = classifyDiagReason(summary.mode, summary.err, nameservers);
  const payload = {
    dns_mode: summary.mode,
    dns_err: summary.err,
    dns_ns: nameservers,
    dns_diag_reason: diag.reason,
    dns_diag_hint: diag.hint,
    domains: results
  };

  if (JSON_MODE) {
    console.log(JSON.stringify(payload));
    return;
  }

  console.log("DNS_DIAG resolv_conf=");
  console.log(resolvConf || "(empty)");
  if (scutil) {
    console.log("DNS_DIAG scutil=");
    console.log(scutil);
  } else {
    console.log("DNS_DIAG scutil=(unavailable)");
  }
  for (const [domain, result] of Object.entries(results)) {
    console.log(
      `DNS_RESOLVE domain=${domain} ok=${result.ok ? 1 : 0} err=${result.err} addrs=${result.addrs.join(",") || "-"}`
    );
  }
  console.log(
    `DNS_CLASSIFICATION mode=${summary.mode} ns=${nameservers.join(",") || "-"} err=${summary.err} reason=${diag.reason}`
  );
}

main().catch((error) => {
  if (JSON_MODE) {
    console.log(
      JSON.stringify({
        dns_mode: "BLOCKED",
        dns_err: String(error?.message || "UNKNOWN"),
        dns_ns: [],
        dns_diag_reason: "DNS_BLOCKED",
        dns_diag_hint: "dns failures are diagnostic only",
        domains: {}
      })
    );
    return;
  }
  console.error(`DNS_DIAG_FATAL err=${String(error?.message || "UNKNOWN")}`);
});
