function isSafeOrigin(value: string | null | undefined) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return Boolean(parsed.protocol && parsed.host && !parsed.username && !parsed.password);
  } catch {
    return false;
  }
}

function originFromReferrer(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function getPublicOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (isSafeOrigin(origin)) return String(origin);

  const refererOrigin = originFromReferrer(request.headers.get("referer"));
  if (refererOrigin) return refererOrigin;

  const forwardedProto = request.headers.get("x-forwarded-proto") || "http";
  const forwardedHost =
    request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (forwardedHost && !/[@/]/.test(forwardedHost)) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const fallback = new URL(request.url);
  fallback.username = "";
  fallback.password = "";
  return fallback.origin;
}
