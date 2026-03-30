export type GpsLookupResult = {
  ok: boolean;
  iso: string;
  state?: string;
  lat?: number;
  lng?: number;
  accuracyM?: number;
  permission: string;
  reason?: string;
  cell?: string;
};

type GpsOptions = {
  timeoutMs?: number;
  permissionHint?: string;
};

type PositionResult =
  | { ok: true; position: GeolocationPosition }
  | { ok: false; error: { code: number; message?: string } };

function getCurrentPositionWithOptions(options: PositionOptions): Promise<PositionResult> {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ ok: true, position }),
      (error) => resolve({ ok: false, error }),
      options
    );
  });
}

async function queryPermissionState() {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return "unsupported";
  }
  try {
    const status = await navigator.permissions.query({
      name: "geolocation" as PermissionName
    });
    return status.state;
  } catch {
    return "unsupported";
  }
}

function getWatchPositionWithOptions(
  options: PositionOptions,
  timeoutMs: number
): Promise<PositionResult> {
  return new Promise((resolve) => {
    let settled = false;
    const fail = (code: number, message?: string) => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, error: { code, message } });
    };
    const done = (position: GeolocationPosition) => {
      if (settled) return;
      settled = true;
      resolve({ ok: true, position });
    };
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        navigator.geolocation.clearWatch(watchId);
        done(position);
      },
      (error) => {
        navigator.geolocation.clearWatch(watchId);
        fail(error.code, error.message);
      },
      options
    );
    setTimeout(() => {
      navigator.geolocation.clearWatch(watchId);
      fail(3, "watch_timeout");
    }, timeoutMs);
  });
}

export async function resolveGpsLocation(
  options: GpsOptions = {}
): Promise<GpsLookupResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return {
      ok: false,
      iso: "UNKNOWN",
      permission: "unsupported",
      reason: "unsupported"
    };
  }

  const permission =
    options.permissionHint ?? (await queryPermissionState());

  const firstAttempt = await getCurrentPositionWithOptions({
    enableHighAccuracy: true,
    timeout: Math.min(options.timeoutMs ?? 15000, 8000),
    maximumAge: 300000
  });

  const attempt =
    !firstAttempt.ok && firstAttempt.error?.code === 3
      ? await getCurrentPositionWithOptions({
          enableHighAccuracy: false,
          timeout: options.timeoutMs ?? 15000,
          maximumAge: 600000
        })
      : firstAttempt;
  const finalAttempt =
    !attempt.ok && (attempt.error?.code === 2 || attempt.error?.code === 3)
      ? await getWatchPositionWithOptions(
          {
            enableHighAccuracy: false,
            timeout: options.timeoutMs ?? 20000,
            maximumAge: 600000
          },
          options.timeoutMs ?? 20000
        )
      : attempt;

  if (!finalAttempt.ok) {
    const geoError = finalAttempt.error;
    const reason =
      geoError?.code === 1
        ? "denied"
        : geoError?.code === 2
          ? "unavailable"
          : geoError?.code === 3
            ? "timeout"
            : "unknown";
    return {
      ok: false,
      iso: "UNKNOWN",
      permission,
      reason
    };
  }

  const position = finalAttempt.position;
  const lat = position.coords.latitude;
  const lng = position.coords.longitude;
  const accuracyM = Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : undefined;
  const cell = buildGpsCell(lat, lng);
  try {
    const url = new URL("/api/reverse-geocode", window.location.origin);
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    const res = await fetch(url.toString(), { method: "GET" });
    const data = await res.json();
    if (!res.ok || !data?.country) {
      return {
        ok: false,
        iso: "UNKNOWN",
        lat,
        lng,
        accuracyM,
        permission,
        reason: data?.error?.code ?? "geo_resolve_failed",
        cell
      };
    }
    return {
      ok: true,
      iso: String(data.country).toUpperCase(),
      state: data.region ? String(data.region).toUpperCase() : undefined,
      lat,
      lng,
      accuracyM,
      permission,
      cell
    };
  } catch {
    return {
      ok: false,
      iso: "UNKNOWN",
      lat,
      lng,
      accuracyM,
      permission,
      reason: "geo_resolve_failed",
      cell
    };
  }
}
import { buildGpsCell } from "@/lib/nearbyCacheStorage";
