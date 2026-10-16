import {
  getNativeCountryDescriptor, getNativeCountryRecords, nativeCountryResponse
} from "@/truth-map/nativeCountryProjection";

export const dynamic = "force-static";
export const dynamicParams = true;
export const revalidate = false;

export function generateStaticParams() {
  return [{ version: getNativeCountryDescriptor().version }];
}

export async function GET(_request: Request, { params }: { params: Promise<{ version: string }> }) {
  const { version } = await params;
  if (!/^[a-f0-9]{16}$/.test(version) || version !== getNativeCountryDescriptor().version) {
    return new Response("not found", { status: 404 });
  }
  const asset = getNativeCountryRecords();
  return nativeCountryResponse(asset.bytes, "application/json; charset=utf-8");
}
