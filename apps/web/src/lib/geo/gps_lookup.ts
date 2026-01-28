export type GpsLookupResult = {
  ok: boolean;
  iso: string;
  state?: string;
  permission: string;
  reason?: string;
  cell?: string;
};

type GpsOptions = {
  timeoutMs?: number;
  permissionHint?: string;
};

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

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const res = await fetch("/api/geo/resolve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lat: position.coords.latitude,
              lon: position.coords.longitude,
              accuracy: position.coords.accuracy ?? undefined,
              permission
            })
          });
          const data = await res.json();
          if (!res.ok || !data?.ok || !data?.iso) {
            resolve({
              ok: false,
              iso: "UNKNOWN",
              permission,
              reason: data?.error?.code ?? "geo_resolve_failed"
            });
            return;
          }
          resolve({
            ok: true,
            iso: String(data.iso).toUpperCase(),
            state: data.region ? String(data.region).toUpperCase() : undefined,
            permission,
            cell: buildGpsCell(position.coords.latitude, position.coords.longitude)
          });
        } catch {
          resolve({
            ok: false,
            iso: "UNKNOWN",
            permission,
            reason: "geo_resolve_failed"
          });
        }
      },
      (geoError) => {
        const reason =
          geoError?.code === 1
            ? "denied"
            : geoError?.code === 2
              ? "unavailable"
              : geoError?.code === 3
                ? "timeout"
                : "unknown";
        resolve({
          ok: false,
          iso: "UNKNOWN",
          permission,
          reason
        });
      },
      { enableHighAccuracy: false, timeout: options.timeoutMs ?? 5000, maximumAge: 600000 }
    );
  });
}
import { buildGpsCell } from "@/lib/nearbyCacheStorage";
