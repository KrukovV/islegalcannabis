import { getStaticCountriesAsset } from "@/new-map/staticCountries";

export const dynamic = "force-dynamic";
export const revalidate = 86400;

function acceptsEncoding(request: Request, encoding: "br" | "gzip") {
  return request.headers
    .get("accept-encoding")
    ?.split(",")
    .map((value) => value.trim().toLowerCase())
    .some((value) => value === encoding || value.startsWith(`${encoding};`)) ?? false;
}

export async function GET(
  request: Request,
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
  const encoding = acceptsEncoding(request, "br")
    ? "br"
    : acceptsEncoding(request, "gzip")
      ? "gzip"
      : "";
  const encodedBody = encoding === "br" ? asset.brotli : encoding === "gzip" ? asset.gzip : null;
  const body: BodyInit = encodedBody
    ? new Blob([new Uint8Array(encodedBody)])
    : asset.json;
  const encodedLength = encoding === "br"
    ? asset.brotliByteLength
    : encoding === "gzip"
      ? asset.gzipByteLength
      : asset.byteLength;
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": asset.cacheControl,
      "Vary": "Accept-Encoding",
      ...(encoding ? { "Content-Encoding": encoding } : {}),
      "Content-Length": String(encodedLength),
      "X-New-Map-Countries-Hash": asset.hash,
      "X-New-Map-Countries-Bytes": String(asset.byteLength),
      "X-New-Map-Countries-Encoding": encoding || "identity",
      "X-New-Map-Countries-Encoded-Bytes": String(encodedLength)
    }
  });
}
