import { NextResponse } from "next/server";
import { buildRetailers } from "@/lib/mapData";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const geo = searchParams.get("geo");
  const retailers = buildRetailers(geo);
  return NextResponse.json({ retailers });
}
