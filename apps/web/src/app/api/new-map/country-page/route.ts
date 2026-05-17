import { NextResponse } from "next/server";
import { getCountryPageData } from "@/lib/countryPageStorage";

const COUNTRY_PAGE_CACHE_CONTROL = "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = String(searchParams.get("code") || "").trim();
  if (!code) {
    return NextResponse.json({ error: "MISSING_CODE" }, { status: 400 });
  }

  const data = getCountryPageData(code);
  if (!data) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json(data, {
    headers: {
      "cache-control": COUNTRY_PAGE_CACHE_CONTROL,
      "cdn-cache-control": COUNTRY_PAGE_CACHE_CONTROL,
      "vercel-cdn-cache-control": COUNTRY_PAGE_CACHE_CONTROL
    }
  });
}
