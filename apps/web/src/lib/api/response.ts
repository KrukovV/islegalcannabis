import { NextResponse } from "next/server";
import { incrementError } from "@/lib/metrics";

export type ApiErrorPayload = {
  ok: false;
  requestId: string;
  error: {
    code: string;
    message: string;
    hint?: string;
  };
};

export function createRequestId(req?: Request): string {
  const headerId = req?.headers.get("x-request-id");
  if (headerId) return headerId;
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function okResponse<T extends Record<string, unknown>>(
  requestId: string,
  data: T,
  status = 200
) {
  return NextResponse.json({ ok: true, requestId, ...data }, { status });
}

export function errorResponse(
  requestId: string,
  status: number,
  code: string,
  message: string,
  hint?: string
) {
  incrementError(code);
  console.error(`[${requestId}] ${code}: ${message}`);
  return NextResponse.json(
    {
      ok: false,
      requestId,
      error: { code, message, hint }
    },
    { status }
  );
}
