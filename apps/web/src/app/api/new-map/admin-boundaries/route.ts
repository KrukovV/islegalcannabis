import { NextResponse } from "next/server";
import { buildAdminBoundarySnapshot } from "@/new-map/countrySource";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json(buildAdminBoundarySnapshot(), {
    headers: {
      "cache-control": "no-store, no-cache, must-revalidate"
    }
  });
}
