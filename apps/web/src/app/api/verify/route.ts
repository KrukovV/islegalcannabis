import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { NextResponse } from "next/server";

const ROOT = process.cwd();
const CATALOG_PATH = path.join(ROOT, "data", "sources", "official_catalog.json");
const RUNNER_PATH = path.join(ROOT, "tools", "on_demand_verify.mjs");

export const runtime = "nodejs";

function loadIsoSet() {
  try {
    const payload = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
    return new Set(Object.keys(payload || {}).map((iso) => String(iso).toUpperCase()));
  } catch {
    return new Set();
  }
}

function isValidIso(input: string) {
  if (!input || typeof input !== "string") return false;
  return /^[A-Z]{2}(-[A-Z0-9]{2,3})?$/.test(input);
}

function writeReport(iso: string, payload: Record<string, unknown>) {
  const reportPath = path.join(ROOT, "Reports", "on_demand", iso, "last_run.json");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2) + "\n");
  return reportPath;
}

export async function POST(req: Request) {
  if (process.env.NETWORK !== "1") {
    return NextResponse.json({ ok: false, reason: "OFFLINE" }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const isoInput = String(body?.iso || "").toUpperCase();
  const regionInput = String(body?.region || "").toUpperCase();
  if (!isValidIso(isoInput)) {
    return NextResponse.json({ ok: false, reason: "INVALID_ISO" }, { status: 400 });
  }
  const baseIso = isoInput.split("-")[0] || "";
  const isoSet = loadIsoSet();
  if (!isoSet.has(baseIso)) {
    return NextResponse.json({ ok: false, reason: "UNKNOWN_ISO" }, { status: 400 });
  }

  const startedAt = new Date().toISOString();
  const jobId = `${Date.now()}`;
  const args = ["--iso", isoInput];
  if (regionInput) args.push("--region", regionInput);
  const result = spawnSync(process.execPath, [RUNNER_PATH, ...args], {
    encoding: "utf8",
    timeout: 20000,
    env: { ...process.env, ON_DEMAND_RUN_ID: jobId }
  });

  const runError = result.error as NodeJS.ErrnoException | undefined;
  if (runError?.code === "ETIMEDOUT") {
    const reportPath = writeReport(isoInput, {
      iso: isoInput,
      iso2: baseIso,
      started_at: startedAt,
      result: "pending",
      reason: "TIMEOUT",
      job_id: jobId
    });
    return NextResponse.json(
      { ok: true, status: "pending", job_id: jobId, report_path: reportPath },
      { status: 202 }
    );
  }

  const status = result.status === 0 ? 200 : 202;
  const reportPath = path.join(ROOT, "Reports", "on_demand", jobId, "run.json");
  const reportPayload = fs.existsSync(reportPath)
    ? JSON.parse(fs.readFileSync(reportPath, "utf8"))
    : null;
  return NextResponse.json(
    {
      ok: result.status === 0,
      status: result.status === 0 ? "verified" : "pending",
      report: reportPayload,
      report_path: reportPath
    },
    { status }
  );
}
