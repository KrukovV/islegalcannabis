"use client";

type AnalyticsEvent =
  | "page_view"
  | "premium_click"
  | "near_legal_search"
  | "check_performed"
  | "paraphrase_generated"
  | "upgrade_clicked";

const DEFAULT_ENDPOINT = "/api/analytics";
let initialized = false;
let endpoint = DEFAULT_ENDPOINT;

function resolveEndpoint(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT ||
    process.env.NEXT_PUBLIC_UMAMI_ENDPOINT ||
    "";
  const value = String(fromEnv || "").trim();
  return value || DEFAULT_ENDPOINT;
}

export function initAnalytics() {
  if (initialized || typeof window === "undefined") {
    return;
  }
  endpoint = resolveEndpoint();
  initialized = true;
}

export async function trackEvent(event: AnalyticsEvent, payload?: Record<string, unknown>) {
  if (typeof window === "undefined") {
    return;
  }
  if (!initialized) {
    initAnalytics();
  }
  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, payload: payload || {} }),
      keepalive: true
    });
  } catch {
    // analytics is best-effort and must never break render flow
  }
}

