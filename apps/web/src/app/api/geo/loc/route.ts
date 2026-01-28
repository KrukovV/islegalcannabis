import { createRequestId, okResponse, errorResponse } from "@/lib/api/response";
import fs from "node:fs";
import path from "node:path";

type GeoLocBody = {
  source?: string;
  iso?: string;
  state?: string | null;
  confidence?: number;
  ts?: string | null;
};

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

function toLine(payload: GeoLocBody) {
  const source = String(payload.source || "none").toLowerCase();
  const iso = String(payload.iso || "UNKNOWN").toUpperCase();
  const state = payload.state ? String(payload.state).toUpperCase() : "-";
  const confidence = Number.isFinite(payload.confidence)
    ? Number(payload.confidence).toFixed(1)
    : "0.0";
  const ts = payload.ts ?? new Date().toISOString();
  return `GEO_LOC source=${source} iso=${iso} state=${state} confidence=${confidence} ts=${ts}`;
}

export async function POST(req: Request) {
  const requestId = createRequestId(req);
  let payload: GeoLocBody = {};
  try {
    payload = (await req.json()) as GeoLocBody;
  } catch {
    return errorResponse(requestId, 400, "BAD_INPUT", "Invalid JSON body.");
  }

  const line = toLine(payload);
  appendSsotLine(line);

  return okResponse(requestId, { ok: true });
}
