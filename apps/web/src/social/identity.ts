import { createHash, randomBytes } from "node:crypto";
import type { Sql } from "postgres";
import type { SocialActor } from "./domain";

export const SOCIAL_SESSION_COOKIE = "islegal_social_session";
export const SOCIAL_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export type SocialIdentity = SocialActor & {
  displayName: string;
};

function sessionTokenFromRequest(request: Request) {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === SOCIAL_SESSION_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function displayNameKey(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

export function validateSocialDisplayName(value: unknown) {
  if (typeof value !== "string") throw new Error("SOCIAL_DISPLAY_NAME_INVALID");
  const displayName = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (displayName.length < 2 || displayName.length > 40) throw new Error("SOCIAL_DISPLAY_NAME_INVALID");
  if (/\p{C}/u.test(displayName) || /[<>]/.test(displayName)) throw new Error("SOCIAL_DISPLAY_NAME_INVALID");
  return displayName;
}

export async function getSocialIdentity(sql: Sql, request: Request): Promise<SocialIdentity | null> {
  const token = sessionTokenFromRequest(request);
  if (!token || token.length < 32) return null;
  const rows = await sql<Array<{ id: string; display_name: string; role: "USER" | "MODERATOR" | "ADMIN" }>>`
    SELECT users.id, users.display_name, users.role
    FROM social_sessions sessions
    JOIN social_users users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ${hashToken(token)}
      AND sessions.revoked_at IS NULL
      AND sessions.expires_at > now()
      AND users.status = 'ACTIVE'
    LIMIT 1
  `;
  const identity = rows[0];
  if (!identity) return null;
  return {
    userId: identity.id,
    displayName: identity.display_name,
    roles: [identity.role],
  };
}

export async function createSocialIdentity(sql: Sql, rawDisplayName: unknown) {
  const displayName = validateSocialDisplayName(rawDisplayName);
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SOCIAL_SESSION_TTL_SECONDS * 1000).toISOString();
  const identity = await sql.begin(async (tx) => {
    const users = await tx<Array<{ id: string; display_name: string; role: "USER" }>>`
      INSERT INTO social_users (display_name, display_name_key)
      VALUES (${displayName}, ${displayNameKey(displayName)})
      RETURNING id, display_name, role
    `;
    const user = users[0];
    await tx`
      INSERT INTO social_sessions (user_id, token_hash, expires_at)
      VALUES (${user.id}, ${hashToken(token)}, ${expiresAt})
    `;
    await tx`SELECT set_config('app.social_user_id', ${user.id}, true)`;
    await tx`
      INSERT INTO social_user_profiles (user_id, display_name)
      VALUES (${user.id}, ${user.display_name})
    `;
    return user;
  });
  return {
    token,
    expiresAt,
    identity: { userId: identity.id, displayName: identity.display_name, roles: [identity.role] as const },
  };
}

export async function revokeSocialIdentity(sql: Sql, request: Request) {
  const token = sessionTokenFromRequest(request);
  if (!token) return;
  await sql`
    UPDATE social_sessions SET revoked_at = now()
    WHERE token_hash = ${hashToken(token)} AND revoked_at IS NULL
  `;
}

export function socialSessionCookie(token: string, maxAge = SOCIAL_SESSION_TTL_SECONDS) {
  const attributes = [
    `${SOCIAL_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAge}`,
  ];
  if (process.env.NODE_ENV === "production") attributes.push("Secure");
  return attributes.join("; ");
}
