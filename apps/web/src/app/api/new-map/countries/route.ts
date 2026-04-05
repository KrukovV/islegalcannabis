import { NextResponse } from "next/server";
import { buildCountrySourceSnapshot } from "@/new-map/countrySource";

export async function GET() {
  return NextResponse.json(buildCountrySourceSnapshot(), {
    headers: {
      "cache-control": "public, max-age=300, stale-while-revalidate=86400"
    }
  });
}
