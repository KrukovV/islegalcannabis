type GeoLocPayload = {
  iso?: string;
  iso2?: string;
  country?: string;
  lat?: number | null;
  lng?: number | null;
  provider?: string;
};

export type ResolvedIpGeo = {
  country: string;
  iso2?: string;
  lat?: number;
  lng?: number;
  provider: "server" | "vercel" | "ipwho" | "ipinfo" | "stub";
};

function unwrapGeoPayload(payload: unknown): GeoLocPayload | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const data = root.data;
  if (data && typeof data === "object") {
    return data as GeoLocPayload;
  }
  return root as GeoLocPayload;
}

function normalizeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export async function resolveIp(): Promise<ResolvedIpGeo | null> {
  try {
    const response = await fetch("/api/geo/loc", {
      cache: "no-store",
      credentials: "same-origin"
    });
    if (!response.ok) return null;
    const payload = unwrapGeoPayload(await response.json());
    const iso2 = String(payload?.iso2 || payload?.iso || "").trim().toUpperCase();
    if (!iso2 || iso2 === "UNKNOWN") return null;
    return {
      country: String(payload?.country || iso2).trim() || iso2,
      iso2,
      lat: normalizeNumber(payload?.lat),
      lng: normalizeNumber(payload?.lng),
      provider: payload?.provider === "vercel" || payload?.provider === "ipwho" || payload?.provider === "ipinfo" || payload?.provider === "stub"
        ? payload.provider
        : "server"
    };
  } catch {
    return null;
  }
}
