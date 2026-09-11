import { NextResponse } from "next/server";
import { isLocalAuditHost } from "@/lib/privateAuditHost";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ geo: string }> }
) {
  const host = request.headers.get("host") || new URL(request.url).host;
  if (!isLocalAuditHost(host)) return new NextResponse(null, { status: 404 });
  const { getEvidencePassport, renderEvidencePassportPrintHtml } = await import("@/truth-map/evidencePassport");
  const { geo } = await params;
  const passport = getEvidencePassport(geo, new URL(request.url).origin);
  if (!passport) return NextResponse.json({ error: "EVIDENCE_PASSPORT_GEO_NOT_FOUND" }, { status: 404 });
  return new NextResponse(renderEvidencePassportPrintHtml(passport), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="islegal-evidence-passport-${passport.geo.toLowerCase()}.html"`,
      "X-Evidence-Passport-SHA256": passport.integrity.payloadSha256
    }
  });
}
