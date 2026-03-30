export function getPublicOrigin(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host");
  if (host) {
    return `${forwardedProto || "http"}://${host}`;
  }
  return new URL(request.url).origin;
}
