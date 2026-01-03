import { NextResponse } from "next/server";
import { getLawProfile } from "@/lib/lawStore";
import { computeStatus } from "@islegal/shared";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const country = searchParams.get("country") ?? "";
  const region = searchParams.get("region") ?? undefined;

  const profile = getLawProfile({ country, region });

  if (!profile) {
    return NextResponse.json(
      { ok: false, error: "Unknown jurisdiction. Provide country (and region for US)." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, status: computeStatus(profile), profile });
}
