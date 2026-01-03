import { NextResponse } from "next/server";
import { logEvent } from "@/lib/analytics";

export const runtime = "nodejs";

const allowedEvents = new Set([
  "check_performed",
  "paraphrase_generated",
  "upgrade_clicked"
]);

export async function POST(req: Request) {
  let body: { event?: string };
  try {
    body = (await req.json()) as { event?: string };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!body.event || !allowedEvents.has(body.event)) {
    return NextResponse.json(
      { ok: false, error: "Unknown event." },
      { status: 400 }
    );
  }

  logEvent(body.event as "check_performed" | "paraphrase_generated" | "upgrade_clicked");
  return NextResponse.json({ ok: true });
}
