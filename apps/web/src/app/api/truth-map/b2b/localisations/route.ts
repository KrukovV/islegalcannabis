import { NextResponse } from "next/server";
import { isLocalAuditHost } from "@/lib/privateAuditHost";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const host = request.headers.get("host") || new URL(request.url).host;
  if (!isLocalAuditHost(host)) return new NextResponse(null, { status: 404 });
  const url = new URL(request.url);
  const { buildEditorialLocalisationManifest } = await import("@/truth-map/editorialLocalisation");
  try {
    return NextResponse.json(buildEditorialLocalisationManifest(url.searchParams.get("geo") || undefined), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "EDITORIAL_LOCALISATION_INVALID" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
