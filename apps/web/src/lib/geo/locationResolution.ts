import type {
  ConfidenceLevel,
  LocationMethod,
  LocationResolution
} from "@islegal/shared";

type LocationCandidate = {
  country: string;
  region?: string | null;
};

export function confidenceForLocation(method: LocationMethod): ConfidenceLevel {
  if (method === "gps") return "high";
  if (method === "manual") return "medium";
  return "low";
}

export function buildLocationResolution(
  method: LocationMethod,
  _region?: string | null,
  note?: string
): LocationResolution {
  return {
    method,
    confidence: confidenceForLocation(method),
    ...(note ? { note } : {})
  };
}

export function selectPreferredLocationResolution({
  gps,
  ip,
  manual
}: {
  gps?: LocationCandidate;
  ip?: LocationCandidate;
  manual?: LocationCandidate;
}): LocationResolution {
  if (manual) {
    return buildLocationResolution("manual", manual.region);
  }

  if (gps) {
    const mismatch =
      ip &&
      (ip.country !== gps.country ||
        (ip.region ?? null) !== (gps.region ?? null));
    const note = mismatch ? "IP estimate differs; using GPS." : undefined;
    return buildLocationResolution("gps", gps.region, note);
  }

  if (ip) {
    return buildLocationResolution("ip", ip.region);
  }

  return buildLocationResolution("manual");
}

export function formatLocationMethodLabel(
  resolution: LocationResolution
): string {
  switch (resolution.method) {
    case "gps":
      return "Detected via GPS (precise)";
    case "ip":
      return "Detected via IP (approximate)";
    case "manual":
      return "Selected manually";
    default:
      return "Location source";
  }
}

export function formatLocationMethodHint(
  resolution: LocationResolution
): string | null {
  if (resolution.method === "ip" || resolution.confidence !== "high") {
    return "Location may be approximate";
  }
  return null;
}

export function shouldHighlightManualAction(
  resolution: LocationResolution | null
): boolean {
  if (!resolution) return false;
  return resolution.method !== "gps";
}
