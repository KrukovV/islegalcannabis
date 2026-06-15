export function normalizeProdBaseUrl(raw) {
  const input = String(raw || process.env.PROD_BASE_URL || process.env.PROD_AUDIT_TARGET || "https://www.islegal.info").trim();
  if (!input) throw new Error("PROD_BASE_URL_MISSING");
  const url = new URL(input);
  if (url.protocol !== "https:") throw new Error(`PROD_BASE_URL_MUST_BE_HTTPS:${url.protocol}`);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.origin;
}

export function sameOrigin(a, b) {
  return new URL(a).origin === new URL(b).origin;
}

export function assertSameOrigin(seedUrl, navigationUrl) {
  const seedOrigin = new URL(seedUrl).origin;
  const navigationOrigin = new URL(navigationUrl).origin;
  if (seedOrigin !== navigationOrigin) {
    const error = new Error(`ORIGIN_MISMATCH:${seedOrigin}!=${navigationOrigin}`);
    error.code = "ORIGIN_MISMATCH";
    error.seed_origin = seedOrigin;
    error.navigation_origin = navigationOrigin;
    throw error;
  }
  return true;
}

export async function resolveCanonicalOrigin(context, rawBaseUrl) {
  const canonicalOrigin = normalizeProdBaseUrl(rawBaseUrl);
  const redirects = [];
  if (!context?.request?.get) {
    return {
      input: rawBaseUrl,
      canonical_origin: canonicalOrigin,
      final_origin: canonicalOrigin,
      redirects
    };
  }
  const response = await context.request.get(`${canonicalOrigin}/`, {
    failOnStatusCode: false,
    maxRedirects: 0,
    timeout: 15000
  }).catch(() => null);
  const finalUrl = response?.url?.() || `${canonicalOrigin}/`;
  const finalOrigin = normalizeProdBaseUrl(finalUrl);
  if (finalOrigin !== canonicalOrigin) {
    redirects.push({
      from_origin: canonicalOrigin,
      to_origin: finalOrigin,
      status: response?.status?.() ?? null
    });
  }
  return {
    input: rawBaseUrl,
    canonical_origin: canonicalOrigin,
    final_origin: finalOrigin,
    redirects
  };
}

export function prodUrl(baseOrigin, pathname = "/") {
  return new URL(pathname, `${normalizeProdBaseUrl(baseOrigin)}/`).toString();
}
