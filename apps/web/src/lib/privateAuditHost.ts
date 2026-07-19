export function isLocalAuditHost(host: string | null | undefined) {
  const normalized = String(host || "").trim().toLowerCase();
  const hostname = normalized.startsWith("[")
    ? normalized.slice(1, normalized.indexOf("]"))
    : normalized.split(":")[0];
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
