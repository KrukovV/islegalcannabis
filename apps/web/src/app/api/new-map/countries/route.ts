import {
  STATIC_COUNTRIES_HASH,
  STATIC_COUNTRIES_URL,
  getStaticCountriesAsset
} from "@/new-map/staticCountries";

export const dynamic = "force-static";
export const revalidate = false;

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("inline") === "1") {
    const asset = getStaticCountriesAsset();
    return new Response(asset.json, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": asset.cacheControl,
        "Content-Encoding": "identity",
        "X-New-Map-Countries-Hash": asset.hash,
        "X-New-Map-Countries-Bytes": String(asset.byteLength)
      }
    });
  }
  return new Response(null, {
    status: 308,
    headers: {
      Location: STATIC_COUNTRIES_URL,
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "X-New-Map-Countries-Hash": STATIC_COUNTRIES_HASH
    }
  });
}
