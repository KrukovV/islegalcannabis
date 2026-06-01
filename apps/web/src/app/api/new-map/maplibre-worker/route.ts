import { readFile } from "node:fs/promises";
import path from "node:path";

const WORKER_RELATIVE_PATH = path.join("node_modules", "maplibre-gl", "dist", "maplibre-gl-csp-worker.js");
const WORKER_CACHE = "public, max-age=31536000, immutable";

let workerSourcePromise: Promise<string> | null = null;

export const dynamic = "force-static";
export const runtime = "nodejs";

function readWorkerSource() {
  workerSourcePromise ||= readFirstExistingWorkerSource();
  return workerSourcePromise;
}

async function readFirstExistingWorkerSource() {
  const candidates = [
    path.join(process.cwd(), WORKER_RELATIVE_PATH),
    path.join(process.cwd(), "..", "..", WORKER_RELATIVE_PATH)
  ];
  for (const candidate of candidates) {
    try {
      return await readFile(candidate, "utf8");
    } catch {
      continue;
    }
  }
  throw new Error("MAPLIBRE_WORKER_NOT_FOUND");
}

function stripSourceMapHint(source: string) {
  return source.replace(/\n?\/\/# sourceMappingURL=maplibre-gl-csp-worker\.js\.map\s*$/u, "\n");
}

export async function GET() {
  const workerSource = stripSourceMapHint(await readWorkerSource());
  return new Response(workerSource, {
    headers: {
      "Cache-Control": WORKER_CACHE,
      "Content-Type": "application/javascript; charset=utf-8"
    }
  });
}
