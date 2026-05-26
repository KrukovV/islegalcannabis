import { getStaticCountriesAsset } from "@/new-map/staticCountries";

export const dynamic = "force-static";
export const revalidate = 86400;

export async function GET() {
  const asset = getStaticCountriesAsset();
  return new Response(null, {
    status: 308,
    headers: {
      Location: asset.url,
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "X-New-Map-Countries-Hash": asset.hash
    }
  });
}
