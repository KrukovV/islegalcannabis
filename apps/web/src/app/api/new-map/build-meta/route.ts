import { getNewMapRuntimeIdentity } from "@/app/new-map/runtimeConfig";

export const dynamic = "force-dynamic";

export async function GET() {
  const runtimeIdentity = getNewMapRuntimeIdentity();
  const buildStamp = `${runtimeIdentity.buildId}:${runtimeIdentity.commit}:${runtimeIdentity.builtAt}`;
  return Response.json(
    {
      ...runtimeIdentity,
      buildSha: runtimeIdentity.commit,
      buildTime: runtimeIdentity.builtAt,
      buildStamp,
      origin: runtimeIdentity.expectedOrigin,
      at: new Date().toISOString()
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
