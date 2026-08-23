import { createRequestId, errorResponse } from "@/lib/api/response";
import { getSocialSql } from "@/social/database";
import type { SocialRealtimeEvent } from "@/social/providers";
import { subscribeToSocialRealtime } from "@/social/realtime";
import { getSocialRuntimeConfig } from "@/social/runtimeConfig";
import { isSocialQueryCell, MAX_SOCIAL_VIEWPORT_QUERY_CELLS } from "@/social/viewport";
import { rejectRawSocialRequestLocation } from "../requestGuard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const requestId = createRequestId(request);
  const locationError = rejectRawSocialRequestLocation(requestId, request);
  if (locationError) return locationError;
  if (!getSocialRuntimeConfig().publicSocialEnabled) {
    return errorResponse(requestId, 503, "SOCIAL_PUBLIC_DISABLED", "Public Social is currently disabled.");
  }
  const url = new URL(request.url);
  const cells = [...new Set(String(url.searchParams.get("cells") || "").split(",").map((cell) => cell.trim()).filter(Boolean))];
  const discussionId = url.searchParams.get("discussionId");
  if (cells.length > MAX_SOCIAL_VIEWPORT_QUERY_CELLS || !cells.every(isSocialQueryCell)) {
    return errorResponse(requestId, 400, "SOCIAL_REALTIME_TOPICS_INVALID", "Realtime topics exceed the privacy-safe subscription budget.");
  }
  if (discussionId && !UUID.test(discussionId)) {
    return errorResponse(requestId, 400, "SOCIAL_DISCUSSION_ID_INVALID", "Invalid discussion id.");
  }
  if (cells.length === 0 && !discussionId) {
    return errorResponse(requestId, 400, "SOCIAL_REALTIME_TOPICS_REQUIRED", "At least one bounded Social topic is required.");
  }

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let listener: { unlisten(): Promise<void> } | null = null;
  let closed = false;
  const cellSet = new Set(cells);
  const cleanup = async () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    await listener?.unlisten().catch(() => {});
    listener = null;
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, value: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`));
      };
      request.signal.addEventListener("abort", () => void cleanup(), { once: true });
      try {
        const unsubscribe = await subscribeToSocialRealtime(getSocialSql(), (payload) => {
          try {
            const event = JSON.parse(payload) as SocialRealtimeEvent;
            if (event.discussionId === discussionId || (event.queryCell && cellSet.has(event.queryCell))) {
              send("social", event);
            }
          } catch {
            // Invalid infrastructure payloads are dropped; DB/API reconciliation remains authoritative.
          }
        });
        const connectedListener = { unlisten: async () => unsubscribe() };
        if (closed) {
          await connectedListener.unlisten().catch(() => {});
          return;
        }
        listener = connectedListener;
        send("ready", { requestId, durableTruth: "POSTGRESQL", delivery: "INVALIDATION_ONLY" });
      } catch {
        send("degraded", { code: "SOCIAL_REALTIME_UNAVAILABLE", fallback: "API_RECONCILIATION" });
      }
      if (closed) return;
      heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": keepalive\n\n"));
      }, 15_000);
    },
    async cancel() {
      await cleanup();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
