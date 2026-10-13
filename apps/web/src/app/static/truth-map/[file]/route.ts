import { createHash } from "node:crypto";
import { brotliCompressSync, constants } from "node:zlib";
import { buildTruthMapBootstrap } from "@/truth-map/truthMapBootstrap";
import { STATIC_TRUTH_MAP_COUNTRIES_BOOTSTRAP_HASH } from "@/truth-map/staticTruthMapUrls";
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
const bootstrapFile = `countries.${STATIC_TRUTH_MAP_COUNTRIES_BOOTSTRAP_HASH}.js.br`;

export function generateStaticParams() {
  return [...Object.keys(files), bootstrapFile].map((file) => ({ file }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;
  if (file === bootstrapFile) {
    const asset = getStaticTruthMapAsset("countries");
    const script = buildTruthMapBootstrap(asset.json);
    if (createHash("sha256").update(script).digest("hex").slice(0, 12) !== STATIC_TRUTH_MAP_COUNTRIES_BOOTSTRAP_HASH) {
      throw new Error("STATIC_TRUTH_MAP_BOOTSTRAP_INTEGRITY_FAIL");
    }
    const body = brotliCompressSync(script, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } });
    return new Response(new Blob([new Uint8Array(body)]), {
      headers: {
        "Content-Type": "text/javascript; charset=utf-8",
        "Content-Encoding": "br",
        "Cache-Control": asset.cacheControl,
        "X-Truth-Map-Hash": STATIC_TRUTH_MAP_COUNTRIES_BOOTSTRAP_HASH,
        "X-Truth-Map-Source-Hash": asset.hash
      }
    });
  }
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
