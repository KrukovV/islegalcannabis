import { NextResponse } from "next/server";
import { buildAdminBoundarySnapshot } from "@/new-map/countrySource";

export async function GET() {
  return NextResponse.json(buildAdminBoundarySnapshot(), {
    headers: {
      "cache-control": "no-store"
    }
  });
}
