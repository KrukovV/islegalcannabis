import { NextResponse } from "next/server";
import { buildCardIndexSnapshot } from "@/new-map/countrySource";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const RUNTIME_MAP_CACHE = "no-store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const geo = String(searchParams.get("geo") || "").trim().toUpperCase();
  if (!geo) {
    return NextResponse.json({ error: "MISSING_GEO" }, { status: 400 });
  }

  const entry = buildCardIndexSnapshot()[geo] || null;
  if (!entry) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json(entry, {
    headers: {
      "Cache-Control": RUNTIME_MAP_CACHE
    }
  });
}
