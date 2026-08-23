import type { SocialIdentity } from "@/social/identity";
import { getSocialIdentity } from "@/social/identity";
import { getSocialRuntimeConfig } from "@/social/runtimeConfig";
import { getSocialSql } from "@/social/database";

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const HEX_64_PATTERN = /^[0-9a-f]{64}$/;
export const RECEIPT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export async function requireDmActor(request: Request): Promise<SocialIdentity> {
  if (!getSocialRuntimeConfig().dmEnabled) throw new Error("DM_DISABLED");
  const actor = await getSocialIdentity(getSocialSql(), request);
  if (!actor) throw new Error("SOCIAL_IDENTITY_REQUIRED");
  return actor;
}

export function dmErrorCode(error: unknown, fallback = "DM_STORAGE_UNAVAILABLE") {
  return error instanceof Error && /^[A-Z0-9_:.-]+$/.test(error.message) ? error.message : fallback;
}

export function dmErrorStatus(code: string) {
  if (code === "DM_DISABLED") return 503;
  if (code === "DM_SEND_RATE_LIMITED") return 429;
  if (code === "SOCIAL_IDENTITY_REQUIRED" || code === "DM_DEVICE_NOT_AUTHORIZED") return 401;
  if (code.endsWith("NOT_FOUND") || code === "DM_RECEIPT_NOT_FOUND") return 404;
  if (code === "DM_DEVICE_KEY_ALREADY_BOUND" || code === "DM_DUPLICATE_RECEIPT_MISMATCH") return 409;
  if (code.includes("INVALID") || code.includes("EXPIRED") || code.includes("MISMATCH") || code.includes("REVOKED")) return 400;
  return 503;
}

export function validateDeviceLabel(value: unknown) {
  if (typeof value !== "string") throw new Error("DM_DEVICE_LABEL_INVALID");
  const label = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (label.length < 1 || label.length > 80 || /\p{C}|[<>]/u.test(label)) throw new Error("DM_DEVICE_LABEL_INVALID");
  return label;
}

export function validateDmExpiry(value: unknown) {
  if (typeof value !== "string") throw new Error("DM_EXPIRY_INVALID");
  const expiresAt = new Date(value);
  const lifetime = expiresAt.getTime() - Date.now();
  if (!Number.isFinite(expiresAt.getTime()) || lifetime < 60_000 || lifetime > 7 * 24 * 60 * 60 * 1_000) {
    throw new Error("DM_EXPIRY_INVALID");
  }
  return expiresAt.toISOString();
}

export function objectPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("DM_REQUEST_BODY_INVALID");
  return value as Record<string, unknown>;
}
