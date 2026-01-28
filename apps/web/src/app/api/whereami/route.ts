import { resolveIpToJurisdiction } from "@/lib/geo/ip";
import { buildLocationResolution } from "@/lib/geo/locationResolution";
import { createRequestId, okResponse } from "@/lib/api/response";
import fs from "node:fs";
import path from "node:path";

function appendSsotLine(line: string) {
  const reportsPath = path.join(process.cwd(), "Reports", "ci-final.txt");
  const runId = process.env.RUN_ID;
  const runPath = runId
    ? path.join(process.cwd(), "Artifacts", "runs", runId, "ci-final.txt")
    : null;
  try {
    fs.mkdirSync(path.dirname(reportsPath), { recursive: true });
    fs.appendFileSync(reportsPath, `${line}\n`);
  } catch {
    // Ignore SSOT append failures.
  }
  if (runPath) {
    try {
      fs.mkdirSync(path.dirname(runPath), { recursive: true });
      fs.appendFileSync(runPath, `${line}\n`);
    } catch {
      // Ignore run-scoped SSOT failures.
    }
  }
}

export async function GET(req: Request) {
  const requestId = createRequestId(req);
  const forwardedFor = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  const rawIp = forwardedFor ?? realIp ?? "";
  const ip = rawIp.split(",")[0]?.trim() || null;

  const result = resolveIpToJurisdiction(ip);
  const resolution = buildLocationResolution("ip", result.region);
  appendSsotLine(
    `GEO_RESOLVE ok=1 source=IP permission=unsupported iso=${result.country} geo=${result.country}${result.region ? `-${result.region}` : ""} reason=OK`
  );
  console.info(`[${requestId}] whereami_resolved`);

  return okResponse(requestId, {
    ...result,
    confidence: resolution.confidence
  });
}
