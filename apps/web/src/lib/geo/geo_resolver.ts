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
  cell?: string;
};

type ResolveOptions = {
  permissionHint?: string;
};

export async function resolveGeoLocation(
  options: ResolveOptions = {}
): Promise<GeoResolution> {
  const manual = loadManualSelection();
  if (manual?.iso) {
    return {
      source: "manual",
      iso: manual.iso,
      state: manual.state,
      confidence: 1.0,
      permission: "prompt"
    };
  }
  const stored = loadLocationContext();
  if (stored?.mode === "manual") {
    return {
      source: "manual",
      iso: stored.country,
      state: stored.region,
      confidence: 1.0,
      permission: "prompt"
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
      cell: gps.cell
    };
  }

  const ip = await resolveIpLocation();
  if (ip.ok && ip.iso !== "UNKNOWN") {
    return {
      source: "ip",
      iso: ip.iso,
      state: ip.state,
      confidence: 0.6,
      permission: "unsupported",
      reason: gps.reason ?? ip.reason
    };
  }

  return {
    source: "none",
    iso: "UNKNOWN",
    confidence: 0.0,
    permission: "unsupported",
    reason: gps.reason ?? ip.reason ?? "not_found"
  };
}
