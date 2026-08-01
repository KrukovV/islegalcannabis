import {
  getStaticCountriesAsset,
  STATIC_COUNTRIES_HASH
} from "@/new-map/staticCountries";

export const dynamic = "force-static";
export const dynamicParams = true;
export const revalidate = false;

export function generateStaticParams() {
  return [{ file: `countries.${STATIC_COUNTRIES_HASH}.json.br` }];
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const asset = getStaticCountriesAsset();
  const { file } = await params;
  if (!/^countries\.[a-f0-9]{12}\.json\.br$/.test(file)) {
    return new Response("not found", {
      status: 404,
      headers: {
        "Cache-Control": "public, max-age=60"
      }
    });
  }
  return new Response(new Blob([new Uint8Array(asset.brotli)]), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": asset.cacheControl,
      "Content-Encoding": "br",
      "Content-Length": String(asset.brotliByteLength),
      "X-New-Map-Countries-Hash": asset.hash,
      "X-New-Map-Countries-Bytes": String(asset.byteLength),
      "X-New-Map-Countries-Encoding": "br",
      "X-New-Map-Countries-Encoded-Bytes": String(asset.brotliByteLength)
    }
  });
}
