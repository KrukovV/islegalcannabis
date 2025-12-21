import { NextResponse } from "next/server";
import { resolveByBbox } from "@/lib/geo/bbox";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      { ok: false, error: "Provide valid lat and lon query parameters." },
      { status: 400 }
    );
  }

  const resolved = resolveByBbox(lat, lon);

  return NextResponse.json({ ok: true, ...resolved, method: "bbox" });
}
