import type {
  ConfidenceLevel,
  LocationMethod as SharedLocationMethod,
  LocationResolution
} from "@islegal/shared";

export type LocationMethod = SharedLocationMethod;

export type LocationContext = {
  mode: "detected" | "manual" | "query";
  country: string;
  region?: string;
  method?: LocationMethod;
  confidence?: ConfidenceLevel;
  resolvedAt?: string;
  source: "url" | "geolocation" | "ip" | "user";
};

type DetectedPayload = {
  country: string;
  region?: string;
  method: LocationMethod;
  confidence: ConfidenceLevel;
  resolvedAt?: string;
};

export function fromQuery(input: {
  country: string;
  region?: string;
}): LocationContext {
  return {
    mode: "query",
    country: input.country,
    region: input.region,
    source: "url"
  };
}

export function fromDetected(input: DetectedPayload): LocationContext {
  return {
    mode: "detected",
    country: input.country,
    region: input.region,
    method: input.method,
    confidence: input.confidence,
    resolvedAt: input.resolvedAt,
    source: input.method === "ip" ? "ip" : "geolocation"
  };
}

export function fromManual(country: string, region?: string): LocationContext {
  return {
    mode: "manual",
    country,
    region,
    method: "manual",
    confidence: "high",
    source: "user"
  };
}

function priorityFor(context: LocationContext): number {
  if (context.mode === "manual") return 3;
  if (context.mode === "detected") {
    return context.method === "ip" ? 1 : 2;
  }
  return 0;
}

export function pickPreferredContext(
  contexts: Array<LocationContext | null | undefined>
): LocationContext | null {
  const filtered = contexts.filter(Boolean) as LocationContext[];
  if (filtered.length === 0) return null;
  return filtered.sort((a, b) => priorityFor(b) - priorityFor(a))[0] ?? null;
}

export function pickLocation(input: {
  manual?: LocationContext | null;
  gps?: LocationContext | null;
  ip?: LocationContext | null;
}): { loc: LocationContext | null; method: LocationMethod | null } {
  const preferred = pickPreferredContext([input.manual, input.gps, input.ip]);
  return { loc: preferred ?? null, method: preferred?.method ?? null };
}

export type ResolvedUserLocation = {
  iso: string;
  adm1?: string;
  method: LocationMethod;
  confidence: ConfidenceLevel;
};

type LocationCandidate = {
  lat: number;
  lng: number;
  valid?: boolean;
};

export function resolveLocation(input: {
  manual?: LocationCandidate | null;
  gps?: LocationCandidate | null;
  ip?: LocationCandidate | null;
}): { lat: number | null; lng: number | null; method: LocationMethod } {
  const manual = input.manual?.valid ? input.manual : null;
  const gps = input.gps?.valid ? input.gps : null;
  const ip = input.ip?.valid ? input.ip : null;

  if (manual) {
    return { lat: manual.lat, lng: manual.lng, method: "manual" };
  }
  if (gps) {
    return { lat: gps.lat, lng: gps.lng, method: "gps" };
  }
  if (ip) {
    return { lat: ip.lat, lng: ip.lng, method: "ip" };
  }
  return { lat: null, lng: null, method: "ip" };
}

function isValidContext(
  context: LocationContext | null | undefined
): context is LocationContext {
  return Boolean(context?.country?.trim());
}

export function resolveUserLocation(input: {
  manual?: LocationContext | null;
  gps?: LocationContext | null;
  ip?: LocationContext | null;
}): ResolvedUserLocation {
  const manual = isValidContext(input.manual) ? input.manual : null;
  const gps = isValidContext(input.gps) ? input.gps : null;
  const ip = isValidContext(input.ip) ? input.ip : null;
  const preferred = pickPreferredContext([manual, gps, ip]);

  if (!preferred) {
    return {
      iso: "UN",
      method: "ip",
      confidence: "low"
    };
  }

  const method = preferred.method ?? "ip";
  const confidence = preferred.confidence ?? (method === "ip" ? "low" : "high");

  return {
    iso: preferred.country,
    adm1: preferred.region,
    method,
    confidence
  };
}

export function toLocationResolution(
  context: LocationContext | null
): LocationResolution | null {
  if (!context?.method || !context.confidence) return null;
  return { method: context.method, confidence: context.confidence };
}
