#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { normalizeProdBaseUrl } from "./lib/prod-origin.mjs";
import { redactSensitive } from "./lib/vercel-bypass.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");

function argValue(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1] || fallback;
  return fallback;
}

function statusFromHead(text) {
  const match = String(text || "").match(/^HTTP\/\S+\s+(\d+)/m);
  return match ? Number(match[1]) : null;
}

function hasChallenge(text) {
  return /x-vercel-mitigated:\s*challenge|Security Checkpoint|Code 21|Deployment Protection/i.test(String(text || ""));
}

async function runCurl({ deployment, route, secret }) {
  const child = spawn("vercel", [
    "curl",
    route,
    "--deployment",
    deployment,
    "--protection-bypass",
    secret,
    "-I"
  ], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  const rc = await new Promise((resolve) => {
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(127));
  });
  return {
    route,
    rc,
    status: statusFromHead(stdout),
    challenge_detected: hasChallenge(`${stdout}\n${stderr}`),
    stdout_sample: redactSensitive(stdout.slice(0, 1000), { secret }),
    stderr_sample: redactSensitive(stderr.slice(0, 1000), { secret })
  };
}

async function main() {
  const secret = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "").trim();
  const base = normalizeProdBaseUrl(argValue("base-url", process.env.PROD_BASE_URL || process.env.PROD_AUDIT_TARGET || "https://www.islegal.info"));
  const outDir = path.resolve(argValue("out-dir", path.join(repoRoot, "Reports", "vercel-bypass-recovery")));
  await fs.mkdir(outDir, { recursive: true });
  const routes = ["/", "/new-map?qa=1"];
  const results = secret
    ? await Promise.all(routes.map((route) => runCurl({ deployment: base, route, secret })))
    : routes.map((route) => ({ route, rc: 1, status: null, challenge_detected: false, stdout_sample: "", stderr_sample: "MISSING_VERCEL_AUTOMATION_BYPASS_SECRET" }));
  const pass = results.every((row) => row.rc === 0 && row.status >= 200 && row.status < 400 && !row.challenge_detected);
  const anyChallenge = results.some((row) => row.challenge_detected || [401, 403, 429].includes(Number(row.status || 0)));
  const report = {
    generated_at: new Date().toISOString(),
    canonical_origin: base,
    tool: "vercel curl",
    secret_present: Boolean(secret),
    results,
    decision: pass ? "VERCEL_CURL_PASS" : anyChallenge ? "VERCEL_CHALLENGE_OR_SECRET_INVALID" : "VERCEL_CURL_FAIL"
  };
  report.secret_leak_guard = secret && JSON.stringify(report).includes(secret) ? "FAIL" : "PASS";
  const reportPath = path.join(outDir, "vercel-curl-latest.json");
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`VERCEL_CURL_DECISION=${report.decision}`);
  console.log(`SECRET_PRESENT=${report.secret_present ? 1 : 0}`);
  console.log(`SECRET_LEAK_GUARD=${report.secret_leak_guard}`);
  console.log(`REPORT=${path.relative(repoRoot, reportPath)}`);
  if (!pass || report.secret_leak_guard !== "PASS") process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(redactSensitive(error.message || error));
    process.exit(1);
  });
}
