import { NextResponse } from "next/server";
import { resolveIpToJurisdiction } from "@/lib/geo/ip";

export async function GET(req: Request) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  const rawIp = forwardedFor ?? realIp ?? "";
  const ip = rawIp.split(",")[0]?.trim() || null;

  const result = resolveIpToJurisdiction(ip);

  return NextResponse.json({ ok: true, ...result });
}
