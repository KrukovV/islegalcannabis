import { NextResponse } from "next/server";
import { buildTruthMapDataset } from "@/truth-map/truthMapSource";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(buildTruthMapDataset().countries, { headers: { "Cache-Control": "no-store" } });
}
