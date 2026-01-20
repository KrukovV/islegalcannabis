import { NextResponse } from "next/server";
import { buildGeoJson } from "@/lib/mapData";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "countries";
  if (!["countries", "states", "subregions"].includes(type)) {
    return NextResponse.json({ error: "unsupported type" }, { status: 400 });
  }
  const payload = buildGeoJson(type === "subregions" ? "states" : type);
  return NextResponse.json(payload);
}
