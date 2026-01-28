type GeoLocPayload = {
  source: "manual" | "gps" | "ip" | "none";
  iso: string;
  state?: string;
  confidence: number;
  ts?: string;
};

const GEO_LOC_LAST_KEY = "ilc:geo_loc_last";

function buildLine(payload: GeoLocPayload) {
  const ts = payload.ts ?? new Date().toISOString();
  const state = payload.state ? payload.state.toUpperCase() : "-";
  const iso = payload.iso ? payload.iso.toUpperCase() : "UNKNOWN";
  return `GEO_LOC source=${payload.source} iso=${iso} state=${state} confidence=${payload.confidence.toFixed(1)} ts=${ts}`;
}

export async function writeGeoLoc(payload: GeoLocPayload) {
  if (typeof window === "undefined") return;
  const line = buildLine(payload);
  try {
    const last = window.localStorage.getItem(GEO_LOC_LAST_KEY);
    if (last === line) return;
    window.localStorage.setItem(GEO_LOC_LAST_KEY, line);
  } catch {
    // Ignore storage failures.
  }

  try {
    await fetch("/api/geo/loc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: payload.source,
        iso: payload.iso,
        state: payload.state ?? null,
        confidence: payload.confidence,
        ts: payload.ts ?? null
      })
    });
  } catch {
    // Ignore SSOT write failures.
  }
}
