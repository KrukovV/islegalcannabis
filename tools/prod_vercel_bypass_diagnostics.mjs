#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { buildBypassHeaders, redactSensitive } from "./lib/vercel-bypass.mjs";
import { createProdContextWithBypass, ensureVercelBypassState, getBypassStatePath, validateBypassState } from "./lib/vercel-bypass-session.mjs";
import { normalizeProdBaseUrl, prodUrl } from "./lib/prod-origin.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function argValue(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

const baseUrl = normalizeProdBaseUrl(argValue("base-url", process.env.PROD_BASE_URL || "https://www.islegal.info"));
const statePath = getBypassStatePath({ statePath: argValue("bypass-state", "playwright/.auth/vercel-bypass.production.json") });
const secret = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "").trim();
const runId = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outDir = path.join(repoRoot, "Reports", "vercel-bypass-recovery");
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const modes = [];
try {
  await ensureVercelBypassState({ browser, baseUrl, statePath, forceRefresh: true, stopOnChallenge: true });
  modes.push({ mode: "method2-cookie-state", result: "PASS" });

  const context1 = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  await context1.route("**/*", async (route) => {
    const request = route.request();
    if (new URL(request.url()).origin !== baseUrl) return route.abort("blockedbyclient");
    if (request.resourceType() === "document") {
      return route.continue({ headers: { ...request.headers(), ...buildBypassHeaders({ secret }) } });
    }
    return route.continue();
  });
  const method1 = await validateBypassState(context1, { baseUrl, secret, requireAppEvidence: false });
  await context1.close().catch(() => undefined);
  modes.push({ mode: "method1-document-extra-headers", result: method1.result, challenge_count: method1.challenge_count });

  const created = await createProdContextWithBypass(browser, { baseUrl, statePath, validateExisting: false, noWarmupIfStateValid: true });
  const stateOnly = await validateBypassState(created.context, { baseUrl, secret });
  await created.context.close().catch(() => undefined);
  modes.push({ mode: "state-only", result: stateOnly.result, challenge_count: stateOnly.challenge_count });
} catch (error) {
  modes.push({ mode: "diagnostic", result: "FAIL", reason: error.code || error.message || "UNKNOWN" });
} finally {
  await browser.close().catch(() => undefined);
}

const report = {
  generated_at: new Date().toISOString(),
  run_id: runId,
  canonical_origin: baseUrl,
  state_path: path.relative(repoRoot, statePath),
  modes,
  secret_present: Boolean(secret),
  secret_leak_guard: JSON.stringify(modes).includes(secret) ? "FAIL" : "PASS"
};
await fs.writeFile(path.join(outDir, "diagnostics-latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`PROD_BYPASS_DIAGNOSTICS_RUN=${runId}`);
console.log(`MODES=${modes.map((mode) => `${mode.mode}:${mode.result}`).join(",")}`);
console.log(`SECRET_LEAK_GUARD=${report.secret_leak_guard}`);
if (report.secret_leak_guard !== "PASS" || modes.some((mode) => mode.result === "FAIL")) {
  console.error(redactSensitive("diagnostics failed", { secret }));
  process.exit(1);
}
