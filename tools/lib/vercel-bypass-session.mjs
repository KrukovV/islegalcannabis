import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { diffVercelBypassCookies, sanitizeVercelEvidenceHeaders } from "../vercel_bypass.mjs";
import { buildBypassHeaders, isLikelyVercelChallenge, redactSensitive } from "./vercel-bypass.mjs";
import { assertSameOrigin, normalizeProdBaseUrl, prodUrl } from "./prod-origin.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DEFAULT_BYPASS_STATE_PATH = "playwright/.auth/vercel-bypass.production.json";

function asBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return !["0", "false", "no"].includes(String(value).toLowerCase());
}

function relativePath(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function stopError(code, report = {}) {
  const error = new Error(code);
  error.code = code;
  error.report = report;
  return error;
}

function compactUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.search = url.search ? "?[redacted]" : "";
    url.hash = "";
    return url.toString();
  } catch {
    return String(rawUrl || "");
  }
}

async function responseEvidence(response, secret, bodyLimit = 300) {
  if (!response) {
    return {
      status: null,
      url: "",
      origin: "",
      x_vercel_mitigated: "",
      content_type: "",
      body_sample: ""
    };
  }
  const headers = typeof response.headers === "function" ? response.headers() : {};
  const sanitizedHeaders = sanitizeVercelEvidenceHeaders(headers, secret);
  const body = await response.text().catch(() => "");
  const url = typeof response.url === "function" ? response.url() : "";
  return {
    status: response.status(),
    url: compactUrl(url),
    origin: url ? new URL(url).origin : "",
    x_vercel_mitigated: sanitizedHeaders["x-vercel-mitigated"] || "",
    x_vercel_id: sanitizedHeaders["x-vercel-id"] || "",
    content_type: sanitizedHeaders["content-type"] || "",
    body_sample: redactSensitive(body.slice(0, bodyLimit), { secret })
  };
}

async function readStateSummary(statePath) {
  const stat = await fs.stat(statePath).catch(() => null);
  if (!stat) {
    return {
      storage_state_present: false,
      storage_state_age_ms: null,
      storage_state_cookie_count: 0,
      storage_state_domains: []
    };
  }
  const parsed = await fs.readFile(statePath, "utf8").then((text) => JSON.parse(text)).catch(() => ({}));
  const cookies = Array.isArray(parsed.cookies) ? parsed.cookies : [];
  return {
    storage_state_present: true,
    storage_state_age_ms: Math.max(0, Date.now() - stat.mtimeMs),
    storage_state_cookie_count: cookies.length,
    storage_state_domains: [...new Set(cookies.map((cookie) => String(cookie.domain || "")).filter(Boolean))]
  };
}

async function writeBlocker(options, report) {
  const outDir = path.resolve(repoRoot, "Reports", "vercel-bypass-recovery");
  await fs.mkdir(outDir, { recursive: true });
  const payload = {
    generated_at: new Date().toISOString(),
    stage: options.stage || "vercel_bypass_session",
    status: "STOPPED",
    reason: report.stop_reason || report.reason || "VERCEL_CHALLENGE_WINDOW",
    challenge_count: report.challenge_count || 1,
    storage_state_path: report.storage_state_path || relativePath(getBypassStatePath(options)),
    secret_leak_guard: "PASS",
    next_action: "STOP_COOLDOWN_SINGLE_PROBE_ONLY"
  };
  await fs.writeFile(path.join(outDir, "storage-state-blocker.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export function getBypassStatePath(options = {}) {
  const raw = options.statePath || options.bypassState || options.storageStatePath || DEFAULT_BYPASS_STATE_PATH;
  return path.resolve(repoRoot, raw);
}

export function redactBypassStateForReport(stateOrPath, options = {}) {
  const statePath = typeof stateOrPath === "string" ? stateOrPath : options.statePath || "";
  const state = typeof stateOrPath === "object" && stateOrPath ? stateOrPath : null;
  const cookies = Array.isArray(state?.cookies) ? state.cookies : [];
  return {
    storage_state_present: Boolean(statePath || state),
    storage_state_path: statePath ? relativePath(path.resolve(repoRoot, statePath)) : "",
    storage_state_cookie_count: cookies.length,
    storage_state_domains: [...new Set(cookies.map((cookie) => String(cookie.domain || "")).filter(Boolean))],
    secret_leak_guard: "PASS"
  };
}

export async function validateBypassState(context, options = {}) {
  const secret = String(options.secret ?? process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "").trim();
  const canonicalOrigin = normalizeProdBaseUrl(options.baseUrl);
  const navigationUrl = prodUrl(canonicalOrigin, options.validationPath || "/new-map?qa=1");
  assertSameOrigin(prodUrl(canonicalOrigin, "/"), navigationUrl);

  const metrics = {
    page_count: 0,
    document_navigation_count: 0
  };
  const page = options.page || await context.newPage();
  if (!options.page) metrics.page_count = 1;
  try {
    const response = await page.goto(navigationUrl, { waitUntil: "domcontentloaded", timeout: Number(options.timeoutMs || 45000) });
    metrics.document_navigation_count = 1;
    const evidence = await responseEvidence(response, secret);
    const title = await page.title().catch(() => "");
    const body = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
    const root = await page.locator('[data-testid="new-map-root"]').count().catch(() => 0);
    const surface = await page.locator('[data-testid="new-map-surface"]').count().catch(() => 0);
    const textEvidence = `${title}\n${body.slice(0, 300)}`;
    const challengeDetected = isLikelyVercelChallenge(evidence, textEvidence);
    const originMatch = new URL(page.url()).origin === canonicalOrigin;
    return {
      result: !challengeDetected && originMatch && Number(evidence.status || 0) >= 200 && Number(evidence.status || 0) < 400 && (root > 0 || options.requireAppEvidence === false) && (surface > 0 || options.requireAppEvidence === false)
        ? "PASS"
        : challengeDetected
          ? "STOP"
          : "FAIL",
      stop_reason: challengeDetected ? "VERCEL_CHALLENGE_WINDOW" : originMatch ? "" : "ORIGIN_MISMATCH",
      validation_url: compactUrl(navigationUrl),
      nav_status: evidence.status,
      origin_match: originMatch,
      title,
      has_new_map_root: root > 0,
      has_map_surface: surface > 0,
      security_checkpoint_detected: challengeDetected,
      challenge_count: challengeDetected ? 1 : 0,
      ...metrics
    };
  } finally {
    if (!options.page) await page.close?.().catch(() => undefined);
  }
}

export async function refreshBypassState(browser, options = {}) {
  if (!browser?.newContext) throw new Error("BROWSER_REQUIRED_FOR_BYPASS_STATE_REFRESH");
  const secret = String(options.secret ?? process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "").trim();
  if (!secret) throw new Error("MISSING_VERCEL_AUTOMATION_BYPASS_SECRET");
  const canonicalOrigin = normalizeProdBaseUrl(options.baseUrl);
  const seedUrl = prodUrl(canonicalOrigin, "/");
  const statePath = getBypassStatePath(options);
  await fs.mkdir(path.dirname(statePath), { recursive: true });

  const context = await browser.newContext({
    viewport: options.viewport || { width: 1600, height: 900 },
    deviceScaleFactor: Number(options.deviceScaleFactor || 1)
  });
  const metrics = {
    bypass_warmup_count: 1,
    seed_request_count: 1,
    context_count: 1,
    page_count: 0,
    document_navigation_count: 0,
    storage_state_used: false,
    storage_state_written: false,
    storage_state_validation_status: "REFRESH_STARTED"
  };
  try {
    const beforeCookies = await context.cookies(canonicalOrigin).catch(() => []);
    const response = await context.request.get(seedUrl, {
      headers: buildBypassHeaders({ secret }),
      failOnStatusCode: false,
      maxRedirects: Number(options.maxRedirects ?? 5),
      timeout: Number(options.timeoutMs || 45000)
    });
    const seedEvidence = await responseEvidence(response, secret);
    const afterSeedCookies = await context.cookies(canonicalOrigin).catch(() => []);
    const seededCookies = diffVercelBypassCookies(beforeCookies, afterSeedCookies);
    const seedChallenge = isLikelyVercelChallenge(seedEvidence, seedEvidence.body_sample);
    const seed = {
      seed_status: seedEvidence.status,
      seed_final_url_origin: seedEvidence.origin || canonicalOrigin,
      seed_x_vercel_mitigated: seedEvidence.x_vercel_mitigated,
      cookie_observed: seededCookies.length > 0,
      cookie_names: seededCookies.map((cookie) => cookie.name).filter(Boolean),
      challenge_detected: seedChallenge
    };
    if (seedChallenge) {
      const report = {
        ...metrics,
        ...seed,
        result: "STOP",
        stop_reason: "VERCEL_CHALLENGE_WINDOW",
        challenge_count: 1,
        storage_state_path: relativePath(statePath)
      };
      await writeBlocker(options, report);
      throw stopError("VERCEL_CHALLENGE_WINDOW", report);
    }

    const validation = await validateBypassState(context, {
      ...options,
      baseUrl: canonicalOrigin,
      secret
    });
    metrics.page_count += validation.page_count || 0;
    metrics.document_navigation_count += validation.document_navigation_count || 0;
    if (validation.challenge_count > 0) {
      const report = {
        ...metrics,
        ...seed,
        validation,
        result: "STOP",
        stop_reason: "VERCEL_CHALLENGE_WINDOW",
        challenge_count: 1,
        storage_state_path: relativePath(statePath)
      };
      await writeBlocker(options, report);
      throw stopError("VERCEL_CHALLENGE_WINDOW", report);
    }
    if (validation.result !== "PASS") {
      throw stopError(validation.stop_reason || "BYPASS_STATE_VALIDATION_FAILED", {
        ...metrics,
        ...seed,
        validation,
        result: "FAIL",
        stop_reason: validation.stop_reason || "BYPASS_STATE_VALIDATION_FAILED",
        challenge_count: 0,
        storage_state_path: relativePath(statePath)
      });
    }

    await context.storageState({ path: statePath });
    await fs.chmod(statePath, 0o600).catch(() => undefined);
    const summary = await readStateSummary(statePath);
    return {
      ...metrics,
      ...seed,
      ...summary,
      result: "PASS",
      storage_state_written: true,
      storage_state_path: relativePath(statePath),
      storage_state_validation_status: "REFRESH_PASS",
      validation,
      challenge_count: 0
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}

export async function ensureVercelBypassState(options = {}) {
  const browser = options.browser;
  const statePath = getBypassStatePath(options);
  const maxAgeMs = Number(options.maxAgeMs ?? 30 * 60 * 1000);
  const stateSummary = await readStateSummary(statePath);
  const fresh = stateSummary.storage_state_present && Number(stateSummary.storage_state_age_ms || 0) <= maxAgeMs;
  const baseReport = {
    ...stateSummary,
    storage_state_path: relativePath(statePath),
    bypass_warmup_count: 0,
    seed_request_count: 0,
    context_count: 0,
    page_count: 0,
    document_navigation_count: 0,
    storage_state_used: false,
    storage_state_written: false,
    challenge_count: 0
  };

  if (fresh && !asBoolean(options.forceRefresh, false)) {
    if (options.validateExisting === false) {
      return {
        ...baseReport,
        result: "PASS",
        storage_state_used: true,
        storage_state_validation_status: "SKIPPED_FRESH_STATE"
      };
    }
    if (!browser?.newContext) throw new Error("BROWSER_REQUIRED_FOR_BYPASS_STATE_VALIDATION");
    const context = await browser.newContext({
      storageState: statePath,
      viewport: options.viewport || { width: 1600, height: 900 },
      deviceScaleFactor: Number(options.deviceScaleFactor || 1)
    });
    try {
      const validation = await validateBypassState(context, options);
      const report = {
        ...baseReport,
        context_count: 1,
        page_count: validation.page_count || 0,
        document_navigation_count: validation.document_navigation_count || 0,
        storage_state_used: true,
        storage_state_validation_status: validation.result === "PASS" ? "VALIDATION_PASS" : "VALIDATION_FAIL",
        validation,
        challenge_count: validation.challenge_count || 0,
        result: validation.result
      };
      if (validation.challenge_count > 0) {
        await writeBlocker(options, report);
        throw stopError("VERCEL_CHALLENGE_WINDOW", report);
      }
      if (validation.result === "PASS") return report;
    } finally {
      await context.close().catch(() => undefined);
    }
  }

  return refreshBypassState(browser, options);
}

export async function createProdContextWithBypass(browser, options = {}) {
  const state = await ensureVercelBypassState({
    ...options,
    browser,
    validateExisting: options.validateExisting ?? false
  });
  const statePath = getBypassStatePath(options);
  const context = await browser.newContext({
    storageState: statePath,
    viewport: options.viewport || { width: 1600, height: 900 },
    deviceScaleFactor: Number(options.deviceScaleFactor || 1)
  });
  return {
    context,
    statePath,
    session: {
      ...state,
      storage_state_used: true,
      storage_state_path: relativePath(statePath),
      context_count: 1,
      page_count: 0,
      document_navigation_count: 0
    }
  };
}
