import { getStaticCountriesAsset } from "@/new-map/staticCountries";

export const dynamic = "force-static";
export const revalidate = 86400;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const asset = getStaticCountriesAsset();
  const { file } = await params;
  if (file !== `countries.${asset.hash}.json`) {
    return new Response("not found", {
      status: 404,
      headers: {
        "Cache-Control": "public, max-age=60"
      }
    });
  }
  return new Response(asset.json, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": asset.cacheControl,
      "X-New-Map-Countries-Hash": asset.hash,
      "X-New-Map-Countries-Bytes": String(asset.byteLength)
    }
  });
}
