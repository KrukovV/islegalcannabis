import { NextResponse } from "next/server";
import { queryStoreSummaryLevels } from "@/lib/storeTruth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CACHE_CONTROL = "no-store, max-age=0";

/** Public read-only Store Truth aggregate with the same visibility gate as leaves. */
export async function GET() {
  const { geoRows, countryRows } = queryStoreSummaryLevels();
  return NextResponse.json({
    rows: geoRows,
    countryRows,
    meta: {
      geoCount: geoRows.length,
      countryCount: countryRows.length,
      visibleStores: geoRows.reduce((total, row) => total + row.count, 0),
    },
  }, { headers: { "Cache-Control": CACHE_CONTROL } });
}
