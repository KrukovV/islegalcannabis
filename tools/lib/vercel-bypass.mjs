import crypto from "node:crypto";
import {
  VERCEL_BYPASS_HEADER,
  VERCEL_SET_BYPASS_COOKIE_HEADER,
  buildVercelBypassCookieSeedUrl,
  diffVercelBypassCookies,
  sanitizeVercelEvidenceHeaders,
  stripVercelBypassQuery
} from "../vercel_bypass.mjs";

export const VERCEL_BYPASS_FLOW = "context_request_cookie_warmup";

function normalizeHeaderMap(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers || {}).map(([name, value]) => [
      String(name).toLowerCase(),
      Array.isArray(value) ? value.map((item) => String(item)).join(", ") : String(value ?? "")
    ])
  );
}

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(String(value ?? "")).digest("hex")}`;
}

function hostKind(input, baseUrl = "") {
  try {
    const url = new URL(input);
    const base = baseUrl ? new URL(baseUrl) : null;
    if (base && url.origin === base.origin) {
      if (url.pathname.startsWith("/api/")) return "same-origin-api";
      if (/glyph/i.test(url.pathname)) return "same-origin-glyphs";
      if (/sprite/i.test(url.pathname)) return "same-origin-sprites";
      return "same-origin";
    }
    return "third-party";
  } catch {
    return "unknown";
  }
}

function responseUrlPath(input) {
  try {
    const url = new URL(input);
    return `${url.pathname}${url.search ? "?[redacted]" : ""}`;
  } catch {
    return "";
  }
}

export function getVercelBypassSecret(options = {}) {
  const required = options.required !== false;
  const secret = String(options.secret ?? process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "").trim();
  if (required && !secret) throw new Error("MISSING_VERCEL_AUTOMATION_BYPASS_SECRET");
  return secret;
}

export function buildVercelBypassHeaders(options = {}) {
  const secret = getVercelBypassSecret({ required: options.required !== false, secret: options.secret });
  if (!secret) return {};
  return {
    [VERCEL_BYPASS_HEADER]: secret,
    [VERCEL_SET_BYPASS_COOKIE_HEADER]: options.sameSiteNone ? "samesitenone" : "true"
  };
}

export function redactSensitive(value, options = {}) {
  const secret = String(options.secret ?? process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "").trim();
  let output = String(value ?? "");
  if (secret) output = output.split(secret).join("[redacted]");
  output = output.replace(/(x-vercel-protection-bypass=)[^&#\s"']+/gi, "$1[redacted]");
  output = output.replace(/(x-vercel-set-bypass-cookie=)[^&#\s"']+/gi, "$1[redacted]");
  output = output.replace(/(__vercel_bypass=)[^;\s"']+/gi, "$1[redacted]");
  output = output.replace(/(_vercel_jwt=)[^;\s"']+/gi, "$1[redacted]");
  return output;
}

export function isLikelyVercelChallenge(responseMeta = {}, bodySnippet = "") {
  const status = Number(responseMeta.status ?? responseMeta.status_code ?? 0) || 0;
  if ([401, 403, 429].includes(status)) return true;

  const headers = normalizeHeaderMap(responseMeta.headers || responseMeta.headers_object || {});
  if (String(headers["x-vercel-mitigated"] || "").toLowerCase() === "challenge") return true;
  if (String(headers["x-vercel-challenge-token"] || "")) return true;

  const url = String(responseMeta.url || responseMeta.response_url || "");
  if (/\/(_vercel|auth|authentication|security|checkpoint|login)/i.test(url)) return true;

  const contentType = String(responseMeta.content_type || headers["content-type"] || "").toLowerCase();
  const body = String(bodySnippet || responseMeta.body_sample || responseMeta.snippet || "");
  const challengeMarkers =
    /Vercel Authentication|Security Checkpoint|Could not verify your browser|Failed to verify your browser|We're verifying your browser|Deployment Protection|Authentication Required|Code 21|x-vercel-challenge-token/i;
  return contentType.includes("text/html") && challengeMarkers.test(body);
}

export async function warmVercelBypass(browserContext, baseUrl, options = {}) {
  if (!browserContext?.request?.get) throw new Error("INVALID_PLAYWRIGHT_CONTEXT");
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" && !options.allowHttpLocalhost) {
    throw new Error("VERCEL_BYPASS_BASE_URL_MUST_BE_HTTPS");
  }

  const startedAt = Date.now();
  const seedUrl = buildVercelBypassCookieSeedUrl(stripVercelBypassQuery(url.toString()));
  const secret = getVercelBypassSecret({ required: options.required !== false, secret: options.secret });
  const headers = buildVercelBypassHeaders({
    secret,
    sameSiteNone: Boolean(options.sameSiteNone),
    required: options.required !== false
  });
  const before = await browserContext.cookies(url.origin).catch(() => []);
  const response = await browserContext.request.get(seedUrl, {
    headers,
    maxRedirects: 0,
    timeout: Number(options.timeoutMs || 45000)
  });
  const body = await response.text().catch(() => "");
  const after = await browserContext.cookies(url.origin).catch(() => []);
  const responseHeaders = typeof response.headers === "function" ? response.headers() : {};
  const sanitizedHeaders = sanitizeVercelEvidenceHeaders(responseHeaders, secret);
  const bodySnippet = redactSensitive(body.slice(0, Number(options.snippetLength || 500)), { secret });
  const bypassCookies = diffVercelBypassCookies(before, after);
  const responseMeta = {
    url: seedUrl,
    status: response.status(),
    headers: sanitizedHeaders,
    content_type: sanitizedHeaders["content-type"] || "",
    body_sample: bodySnippet
  };
  const challengeDetected = isLikelyVercelChallenge(responseMeta, bodySnippet);

  return {
    mode: VERCEL_BYPASS_FLOW,
    fulfilled_by: VERCEL_BYPASS_FLOW,
    target_url: redactSensitive(url.origin, { secret }),
    seed_url: redactSensitive(seedUrl, { secret }),
    request_headers: [VERCEL_BYPASS_HEADER, VERCEL_SET_BYPASS_COOKIE_HEADER],
    cookie_mode: options.sameSiteNone ? "samesitenone" : "true",
    redirect_policy: "maxRedirects=0",
    warmup_status: response.status(),
    warmup_ms: Date.now() - startedAt,
    cookie_observed: bypassCookies.length > 0,
    bypass_cookie_detected: bypassCookies.length > 0,
    bypass_cookie_absence_documented: bypassCookies.length === 0,
    bypass_cookies: bypassCookies.map((cookie) => cookie.name).filter(Boolean),
    cookies_before: before.map((cookie) => cookie.name).filter(Boolean),
    cookies_after: after.map((cookie) => cookie.name).filter(Boolean),
    challenge_detected: challengeDetected,
    challenge_html: challengeDetected ? redactSensitive(body, { secret }) : "",
    body_sample: bodySnippet,
    snippet_hash: sha256(bodySnippet),
    response: {
      status: response.status(),
      location: sanitizedHeaders.location || "",
      x_vercel_mitigated: sanitizedHeaders["x-vercel-mitigated"] || "",
      x_vercel_id: sanitizedHeaders["x-vercel-id"] || "",
      headers_object: sanitizedHeaders
    }
  };
}

export function installVercelChallengeRecorder(page, options = {}) {
  const baseUrl = options.baseUrl || "";
  const secret = String(options.secret ?? process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "").trim();
  const events = [];
  const startedAt = Date.now();

  page.on("response", async (response) => {
    const request = response.request();
    const headers = typeof response.headers === "function" ? response.headers() : {};
    const sanitizedHeaders = sanitizeVercelEvidenceHeaders(headers, secret);
    const contentType = String(sanitizedHeaders["content-type"] || "");
    let bodySnippet = "";
    if (contentType.toLowerCase().includes("text/html") || [401, 403, 429].includes(response.status())) {
      bodySnippet = await response.text().then((text) => text.slice(0, 500)).catch(() => "");
      bodySnippet = redactSensitive(bodySnippet, { secret });
    }
    const meta = {
      url: response.url(),
      status: response.status(),
      headers: sanitizedHeaders,
      content_type: contentType,
      body_sample: bodySnippet
    };
    const challengeDetected = isLikelyVercelChallenge(meta, bodySnippet);
    events.push({
      url_kind: hostKind(response.url(), baseUrl),
      url_path: responseUrlPath(response.url()),
      url_hash: sha256(response.url()),
      method: request.method(),
      resource_type: request.resourceType(),
      status: response.status(),
      content_type: contentType,
      elapsed_ms: Date.now() - startedAt,
      challenge_detected: challengeDetected,
      snippet_hash: bodySnippet ? sha256(bodySnippet) : "",
      x_vercel_mitigated: sanitizedHeaders["x-vercel-mitigated"] || "",
      x_vercel_id: sanitizedHeaders["x-vercel-id"] || ""
    });
  });

  return {
    events,
    summary() {
      const challenged = events.filter((event) => event.challenge_detected);
      const statusCounts = {};
      for (const event of events) {
        statusCounts[String(event.status)] = (statusCounts[String(event.status)] || 0) + 1;
      }
      return {
        total_requests: events.length,
        same_origin_requests: events.filter((event) => event.url_kind.startsWith("same-origin")).length,
        api_requests: events.filter((event) => event.url_kind === "same-origin-api").length,
        failed_requests: events.filter((event) => event.status >= 400).length,
        challenge_count: challenged.length,
        first_challenge: challenged[0] || null,
        challenged_urls: challenged.map((event) => event.url_path).filter(Boolean),
        challenged_types: challenged.map((event) => event.resource_type).filter(Boolean),
        status_counts: statusCounts
      };
    }
  };
}
