import { NextResponse } from "next/server";
import { buildTruthMapDataset } from "@/truth-map/truthMapSource";

export const dynamic = "force-dynamic";

/** Public display adapter: the same canonical 307-GEO projection as the audit route. */
export async function GET() {
  return NextResponse.json(buildTruthMapDataset().usStates, { headers: { "Cache-Control": "no-store" } });
}
