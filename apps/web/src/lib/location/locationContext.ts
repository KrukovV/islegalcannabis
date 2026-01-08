import type {
  ConfidenceLevel,
  LocationMethod,
  LocationResolution
} from "@islegal/shared";

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
    confidence: "medium",
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

export function toLocationResolution(
  context: LocationContext | null
): LocationResolution | null {
  if (!context?.method || !context.confidence) return null;
  return { method: context.method, confidence: context.confidence };
}
