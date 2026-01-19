function normalizeEntry(entry) {
  const rawCountry =
    typeof entry?.country === "string" ? entry.country.trim().toUpperCase() : "";
  const rawRegion =
    typeof entry?.region === "string" ? entry.region.trim().toUpperCase() : "";
  const country = rawCountry.length > 0 ? rawCountry : null;
  const region = rawRegion.length > 0 ? rawRegion : null;
  const fallbackId = typeof entry?.id === "string" ? entry.id.trim() : "";
  const id =
    country ? `${country}${region ? `-${region}` : ""}` : fallbackId || "UNKNOWN";
  const flag = country && country.length === 2
    ? String.fromCodePoint(...country.split("").map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65))
    : "";
  const method = typeof entry?.method === "string" ? entry.method : "unknown";
  const status = typeof entry?.status === "string" ? entry.status : "unknown";
  return {
    id,
    country,
    region,
    flag,
    source: typeof entry?.source === "string" ? entry.source : "unknown",
    method,
    status
  };
}

export function buildSmokeTracePayload({ passed, failed, checks, updatedAt } = {}) {
  const normalizedChecks = Array.isArray(checks) ? checks : [];
  const safeChecks = normalizedChecks.slice(0, 100).map(normalizeEntry);
  const total = Number(passed ?? 0) + Number(failed ?? 0);
  return {
    updatedAt: updatedAt ?? new Date().toISOString(),
    total,
    passed: Number(passed ?? 0),
    failed: Number(failed ?? 0),
    checks: safeChecks
  };
}
