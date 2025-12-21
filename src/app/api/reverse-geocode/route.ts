import { NextResponse } from "next/server";
import { reverseGeocode } from "@/lib/geo/reverseGeocode";

export const runtime = "nodejs";

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

  try {
    const resolved = await reverseGeocode(lat, lon);
    return NextResponse.json({ ok: true, ...resolved });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Reverse geocoding failed." },
      { status: 500 }
    );
  }
}
