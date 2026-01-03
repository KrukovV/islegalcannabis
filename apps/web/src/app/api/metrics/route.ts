import { getMetricsSnapshot } from "@/lib/metrics";
import { createRequestId, errorJson, okJson } from "@/lib/api/response";

export const runtime = "nodejs";

function metricsEnabled() {
  return process.env.METRICS_ENABLED === "1" || process.env.NODE_ENV !== "production";
}

export async function GET(req: Request) {
  const requestId = createRequestId(req);
  if (!metricsEnabled()) {
    return errorJson(requestId, 404, "METRICS_DISABLED", "Metrics are disabled.");
  }

  return okJson(requestId, { metrics: getMetricsSnapshot() });
}
