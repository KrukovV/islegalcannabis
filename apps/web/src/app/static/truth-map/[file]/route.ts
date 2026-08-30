import {
  getStaticTruthMapAsset,
  STATIC_TRUTH_MAP_COUNTRIES_HASH,
  STATIC_TRUTH_MAP_US_STATES_HASH,
  type StaticTruthMapLayer
} from "@/truth-map/staticTruthMap";

export const dynamic = "force-static";
export const dynamicParams = true;
export const revalidate = false;

const files: Record<string, StaticTruthMapLayer> = {
  [`countries.${STATIC_TRUTH_MAP_COUNTRIES_HASH}.json.br`]: "countries",
  [`us-states.${STATIC_TRUTH_MAP_US_STATES_HASH}.json.br`]: "us-states"
};

export function generateStaticParams() {
  return Object.keys(files).map((file) => ({ file }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;
  const layer = files[file];
  if (!layer) {
    return new Response("not found", {
      status: 404,
      headers: { "Cache-Control": "public, max-age=60" }
    });
  }

  const asset = getStaticTruthMapAsset(layer);
  return new Response(new Blob([new Uint8Array(asset.brotli)]), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": asset.cacheControl,
      "Content-Encoding": "br",
      "Content-Length": String(asset.brotliByteLength),
      "X-Truth-Map-Hash": asset.hash,
      "X-Truth-Map-Layer": layer,
      "X-Truth-Map-Bytes": String(asset.byteLength),
      "X-Truth-Map-Encoding": "br",
      "X-Truth-Map-Encoded-Bytes": String(asset.brotliByteLength)
    }
  });
}
