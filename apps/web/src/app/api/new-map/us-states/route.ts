import { NextResponse } from "next/server";
import { buildUsStateSourceSnapshot } from "@/new-map/countrySource";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json(buildUsStateSourceSnapshot(), {
    headers: {
      "cache-control": "no-store, no-cache, must-revalidate"
    }
  });
}
