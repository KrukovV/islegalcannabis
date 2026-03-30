import { readSsotDiffCache } from "@/lib/ssotDiff/ssotDiffRegistry";
import { findRepoRoot } from "@/lib/ssotDiff/ssotSnapshotStore";

export async function GET() {
  const rootDir = findRepoRoot(process.cwd());
  const cache = readSsotDiffCache(rootDir);

  return Response.json(
    {
      generated_at: cache.generated_at,
      pending: cache.pending,
      last_24h: cache.last_24h,
      last_7d: cache.last_7d
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
