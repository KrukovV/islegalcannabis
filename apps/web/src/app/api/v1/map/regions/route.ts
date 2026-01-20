import { NextResponse } from "next/server";
import { buildRegions } from "@/lib/mapData";

export const runtime = "nodejs";

export async function GET() {
  const regions = buildRegions();
  return NextResponse.json({ regions });
}
