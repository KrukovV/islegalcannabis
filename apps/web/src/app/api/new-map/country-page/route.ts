import { NextResponse } from "next/server";
import { getCountryPageData, getCountryPageIndexByIso2 } from "@/lib/countryPageStorage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = String(searchParams.get("code") || "").trim().toLowerCase();
  if (!code) {
    return NextResponse.json({ error: "MISSING_CODE" }, { status: 400 });
  }

  let data = getCountryPageData(code);
  if (!data && /^[a-z]{2}$/.test(code)) {
    const aliasCountryCode = getCountryPageIndexByIso2().get(code.toUpperCase())?.code;
    if (aliasCountryCode) {
      data = getCountryPageData(aliasCountryCode);
    }
  }
  if (!data && code.includes("-")) {
    data = getCountryPageData(code.toLowerCase());
  }
  if (!data) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
