import {
  getNativeCountryDescriptor, getNativeCountryTile, nativeCountryResponse, parseNativeCountryTile
} from "@/truth-map/nativeCountryProjection";

export const dynamic = "force-static";
export const dynamicParams = true;
export const revalidate = false;

export function generateStaticParams() {
  const { version } = getNativeCountryDescriptor();
  // Five global tiles only. Detailed visits use the framework's on-demand
  // static route cache; never generate a global maxzoom18 file pyramid.
  return [[0, 0, 0], [1, 0, 0], [1, 0, 1], [1, 1, 0], [1, 1, 1]]
    .map(([z, x, y]) => ({ version, z: String(z), x: String(x), y: `${y}.pbf` }));
}

type Params = { version: string; z: string; x: string; y: string };
export async function GET(_request: Request, { params }: { params: Promise<Params> }) {
  const { version, z, x, y } = await params;
  const coordinates = parseNativeCountryTile(z, x, y);
  if (!coordinates || !/^[a-f0-9]{16}$/.test(version) || version !== getNativeCountryDescriptor().version) {
    return new Response("not found", { status: 404 });
  }
  const asset = getNativeCountryTile(coordinates);
  return nativeCountryResponse(asset.bytes, "application/vnd.mapbox-vector-tile");
}
