import { NextResponse } from "next/server";
import { incrementError } from "@/lib/metrics";
import {
  API_CONTRACT_VERSION,
  DATA_SCHEMA_VERSION,
  getAppVersion
} from "@islegal/shared";

export type ApiErrorPayload = {
  ok: false;
  requestId: string;
  meta: {
    requestId: string;
    appVersion: string;
    apiVersion: string;
    dataSchemaVersion: number;
  };
  error: {
    code: string;
    message: string;
    hint?: string;
  };
};

function buildVersionMeta(requestId: string) {
  return {
    requestId,
    appVersion: getAppVersion(),
    apiVersion: API_CONTRACT_VERSION,
    dataSchemaVersion: DATA_SCHEMA_VERSION
  };
}

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
  const { meta, ...rest } = data as { meta?: Record<string, unknown> };
  const mergedMeta = {
    ...(meta ?? {}),
    ...buildVersionMeta(requestId)
  };
  return NextResponse.json(
    { ok: true, requestId, ...rest, meta: mergedMeta },
    { status }
  );
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
      meta: buildVersionMeta(requestId),
      error: { code, message, hint }
    },
    { status }
  );
}
