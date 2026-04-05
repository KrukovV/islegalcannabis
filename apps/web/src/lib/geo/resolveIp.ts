type RawIpPayload = {
  latitude?: number;
  longitude?: number;
  lat?: number;
  lon?: number;
  lng?: number;
  country_name?: string;
  country?: string;
  country_code?: string;
  country_code_iso3?: string;
  success?: boolean;
};

export type ResolvedIpGeo = {
  country: string;
  iso2?: string;
  lat: number;
  lng: number;
  provider: "ipapi" | "ipwho";
};

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function normalizeIp(payload: RawIpPayload, provider: "ipapi" | "ipwho"): ResolvedIpGeo | null {
  const lat = typeof payload.latitude === "number" ? payload.latitude : typeof payload.lat === "number" ? payload.lat : undefined;
  const lng = typeof payload.longitude === "number"
    ? payload.longitude
    : typeof payload.lon === "number"
      ? payload.lon
      : typeof payload.lng === "number"
        ? payload.lng
        : undefined;
  const country = String(payload.country_name || payload.country || "").trim();
  const iso2 = String(payload.country_code || "").trim().toUpperCase() || undefined;

  if (typeof lat !== "number" || typeof lng !== "number" || !country) {
    return null;
  }

  return { country, iso2, lat, lng, provider };
}

export async function resolveIp() {
  console.warn("UI_GEO ip start");

  try {
    const response = await fetchWithTimeout("https://ipapi.co/json/", 1500);
    if (response.ok) {
      const normalized = normalizeIp((await response.json()) as RawIpPayload, "ipapi");
      if (normalized) {
        console.warn("UI_GEO provider=ipapi success");
        return normalized;
      }
    }
    console.warn(`UI_GEO provider=ipapi failed status=${response.status}`);
  } catch (error) {
    console.warn("UI_GEO provider=ipapi exception", error);
  }

  try {
    const response = await fetchWithTimeout("https://ipwho.is/", 1500);
    if (response.ok) {
      const payload = (await response.json()) as RawIpPayload;
      if (payload.success !== false) {
        const normalized = normalizeIp(payload, "ipwho");
        if (normalized) {
          console.warn("UI_GEO provider=ipwho success");
          return normalized;
        }
      }
    }
    console.warn(`UI_GEO provider=ipwho failed status=${response.status}`);
  } catch (error) {
    console.warn("UI_GEO provider=ipwho exception", error);
  }

  return null;
}
