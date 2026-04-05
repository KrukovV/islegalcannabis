type HeaderReader = {
  get: (_name: string) => string | null;
};

export function resolveRequestOrigin(headers: HeaderReader) {
  const host = headers.get("x-forwarded-host") || headers.get("host") || "127.0.0.1:3000";
  const proto = headers.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}
