import { NextResponse } from "next/server";
import { isLocalAuditHost } from "@/lib/privateAuditHost";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isLocalRequest(request: Request) {
  const host = request.headers.get("host") || new URL(request.url).host;
  return isLocalAuditHost(host);
}

export async function GET(request: Request) {
  if (!isLocalRequest(request)) return new NextResponse(null, { status: 404 });
  const { buildChangeMonitor, parseChangeMonitorWatchlistQuery } = await import("@/truth-map/changeMonitor");
  try {
    return NextResponse.json(buildChangeMonitor({
      origin: new URL(request.url).origin,
      geos: parseChangeMonitorWatchlistQuery(new URL(request.url).searchParams)
    }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "CHANGE_MONITOR_INVALID_WATCHLIST";
    return NextResponse.json({ error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
