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
  const forwardedProto = request.headers.get("x-forwarded-proto") || "http";
  const forwardedHost =
    request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (forwardedHost && !/[@/]/.test(forwardedHost)) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const refererOrigin = originFromReferrer(request.headers.get("referer"));
  if (refererOrigin) return refererOrigin;

  return "http://127.0.0.1:3000";
}
