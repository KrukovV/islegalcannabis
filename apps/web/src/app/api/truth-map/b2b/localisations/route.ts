import { NextResponse } from "next/server";
import { isLocalAuditHost } from "@/lib/privateAuditHost";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const host = request.headers.get("host") || new URL(request.url).host;
  if (!isLocalAuditHost(host)) return new NextResponse(null, { status: 404 });
  const url = new URL(request.url);
  const { buildEditorialLocalisationManifest, buildEditorialLocalisationPreparation } = await import("@/truth-map/editorialLocalisation");
  try {
    const prepare = url.searchParams.get("prepare");
    if (prepare) {
      const preparation = prepare === "draft"
        ? buildEditorialLocalisationPreparation({ mode: "DRAFT", geo: url.searchParams.get("geo") || "" })
        : prepare === "approval"
          ? buildEditorialLocalisationPreparation({ mode: "APPROVAL", localisationId: url.searchParams.get("localisationId") || "" })
          : (() => { throw new Error(`EDITORIAL_LOCALISATION_PREPARATION_MODE_INVALID=${prepare}`); })();
      return NextResponse.json(preparation, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json(buildEditorialLocalisationManifest(url.searchParams.get("geo") || undefined), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "EDITORIAL_LOCALISATION_INVALID";
    const status = message.startsWith("EDITORIAL_LOCALISATION_DRAFT_MISSING=")
      ? 404
      : message.startsWith("EDITORIAL_LOCALISATION_UNKNOWN_GEO=")
        || message.startsWith("EDITORIAL_LOCALISATION_PREPARATION_MODE_INVALID=")
        || message.startsWith("EDITORIAL_LOCALISATION_ID_")
        || message === "EDITORIAL_LOCALISATION_GEO_REQUIRED"
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
