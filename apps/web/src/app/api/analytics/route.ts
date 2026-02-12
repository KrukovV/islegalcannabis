import { logEvent } from "@/lib/analytics";
import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";

export const runtime = "nodejs";

const allowedEvents = new Set([
  "check_performed",
  "paraphrase_generated",
  "upgrade_clicked"
]);

export async function POST(req: Request) {
  const requestId = createRequestId(req);
  let body: { event?: string };
  try {
    body = (await req.json()) as { event?: string };
  } catch {
    return errorResponse(requestId, 400, "INVALID_JSON", "Invalid JSON body.");
  }

  if (!body.event || !allowedEvents.has(body.event)) {
    return errorResponse(requestId, 400, "UNKNOWN_EVENT", "Unknown event.");
  }

  logEvent(body.event as "check_performed" | "paraphrase_generated" | "upgrade_clicked");
  console.warn(`UI_ANALYTICS request_id=${requestId} event=${body.event}`);
  return okResponse(requestId, {});
}
