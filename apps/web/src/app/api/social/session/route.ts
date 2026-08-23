import { NextResponse } from "next/server";
import { createRequestId, errorResponse, okResponse } from "@/lib/api/response";
import { getSocialSql } from "@/social/database";
import {
  createSocialIdentity,
  getSocialIdentity,
  revokeSocialIdentity,
  socialSessionCookie,
} from "@/social/identity";
import { getSocialRuntimeConfig } from "@/social/runtimeConfig";
import { rejectRawSocialRequestLocation } from "../requestGuard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function unavailable(requestId: string) {
  return errorResponse(requestId, 503, "SOCIAL_IDENTITY_DISABLED", "Social identity is not configured.");
}

export async function GET(request: Request) {
  const requestId = createRequestId(request);
  const locationError = rejectRawSocialRequestLocation(requestId, request);
  if (locationError) return locationError;
  if (!getSocialRuntimeConfig().identityConfigured) return unavailable(requestId);
  try {
    const identity = await getSocialIdentity(getSocialSql(), request);
    return okResponse(requestId, { identity });
  } catch {
    return errorResponse(requestId, 503, "SOCIAL_STORAGE_UNAVAILABLE", "Social identity storage is unavailable.");
  }
}

export async function POST(request: Request) {
  const requestId = createRequestId(request);
  const locationError = rejectRawSocialRequestLocation(requestId, request);
  if (locationError) return locationError;
  if (!getSocialRuntimeConfig().identityConfigured) return unavailable(requestId);
  try {
    const payload = await request.json() as { displayName?: unknown };
    const created = await createSocialIdentity(getSocialSql(), payload.displayName);
    const response = okResponse(requestId, { identity: created.identity }, 201);
    response.headers.set("Set-Cookie", socialSessionCookie(created.token));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "23505") {
      return errorResponse(requestId, 409, "SOCIAL_DISPLAY_NAME_TAKEN", "That Social display name is already in use.");
    }
    const message = error instanceof Error ? error.message : "SOCIAL_IDENTITY_CREATE_FAILED";
    const status = message === "SOCIAL_DISPLAY_NAME_INVALID" ? 400 : 503;
    return errorResponse(requestId, status, message, status === 400 ? "Invalid Social identity." : "Social identity storage is unavailable.");
  }
}

export async function DELETE(request: Request) {
  const requestId = createRequestId(request);
  const locationError = rejectRawSocialRequestLocation(requestId, request);
  if (locationError) return locationError;
  if (!getSocialRuntimeConfig().identityConfigured) return unavailable(requestId);
  try {
    await revokeSocialIdentity(getSocialSql(), request);
    const response = new NextResponse(JSON.stringify({ ok: true, requestId }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
    response.headers.set("Set-Cookie", socialSessionCookie("", 0));
    return response;
  } catch {
    return errorResponse(requestId, 503, "SOCIAL_STORAGE_UNAVAILABLE", "Social identity storage is unavailable.");
  }
}
