import { loadManualSelection } from "@/lib/geo/manual_store";
import { resolveGpsLocation } from "@/lib/geo/gps_lookup";
import { resolveIpLocation } from "@/lib/geo/ip_lookup";
import { loadLocationContext } from "@/lib/location/locationStorage";

export type GeoResolution = {
  source: "manual" | "gps" | "ip" | "none";
  iso: string;
  state?: string;
  confidence: number;
  permission: string;
  reason?: string;
  reasonCode?: string;
  cell?: string;
};

type ResolveOptions = {
  permissionHint?: string;
};

export async function resolveGeoLocation(
  options: ResolveOptions = {}
): Promise<GeoResolution> {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const manual = loadManualSelection();
  if (manual?.iso) {
    return {
      source: "manual",
      iso: manual.iso,
      state: manual.state,
      confidence: 1.0,
      permission: "prompt",
      reasonCode: "USER_SELECT"
    };
  }
  const stored = loadLocationContext();
  if (stored?.mode === "manual") {
    return {
      source: "manual",
      iso: stored.country,
      state: stored.region,
      confidence: 1.0,
      permission: "prompt",
      reasonCode: "USER_SELECT"
    };
  }

  const gps = await resolveGpsLocation({
    permissionHint: options.permissionHint
  });
  if (gps.ok && gps.iso !== "UNKNOWN") {
    return {
      source: "gps",
      iso: gps.iso,
      state: gps.state,
      confidence: 0.9,
      permission: gps.permission,
      reason: gps.reason,
      reasonCode: "GPS_OK",
      cell: gps.cell
    };
  }

  if (offline) {
    return {
      source: "none",
      iso: "UNKNOWN",
      confidence: 0.0,
      permission: "unsupported",
      reason: "offline",
      reasonCode: "OFFLINE_NO_IP"
    };
  }

  const ip = await resolveIpLocation();
  if (ip.ok && ip.iso !== "UNKNOWN") {
    const gpsReason = String(gps.reason || "").toLowerCase();
    const reasonCode =
      gpsReason === "denied"
        ? "GPS_DENIED"
        : gpsReason === "timeout"
          ? "GPS_TIMEOUT"
          : "IP_FALLBACK";
    return {
      source: "ip",
      iso: ip.iso,
      state: ip.state,
      confidence: 0.6,
      permission: "unsupported",
      reason: gps.reason ?? ip.reason,
      reasonCode
    };
  }

  return {
    source: "none",
    iso: "UNKNOWN",
    confidence: 0.0,
    permission: "unsupported",
    reason: gps.reason ?? ip.reason ?? "not_found",
    reasonCode: "UNKNOWN"
  };
}
