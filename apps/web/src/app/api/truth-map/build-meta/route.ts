import { getTruthMapRuntimeIdentity } from "@/app/truth-map/runtimeConfig";

export const dynamic = "force-dynamic";

export async function GET() {
  const runtimeIdentity = getTruthMapRuntimeIdentity();
  return Response.json({
    ...runtimeIdentity,
    buildSha: runtimeIdentity.commit,
    buildTime: runtimeIdentity.builtAt,
    buildStamp: `${runtimeIdentity.buildId}:${runtimeIdentity.commit}:${runtimeIdentity.builtAt}`,
    origin: runtimeIdentity.expectedOrigin,
    at: new Date().toISOString()
  }, { headers: { "Cache-Control": "no-store" } });
}
