/* global fetch */

import process from "node:process";

const discussionId = process.argv[2];
const baseUrl = process.env.SOCIAL_LIVE_BASE_URL || "http://127.0.0.1:3000";

if (!discussionId) throw new Error("SOCIAL_LIVE_DISCUSSION_ID_REQUIRED");

async function jsonResponse(response) {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.code || `SOCIAL_LIVE_HTTP_${response.status}`);
  }
  return payload;
}

const peerName = `ui-peer-${Date.now().toString(36)}`;
const sessionResponse = await fetch(`${baseUrl}/api/social/session`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ displayName: peerName }),
});
const sessionPayload = await jsonResponse(sessionResponse);
const cookie = sessionResponse.headers.get("set-cookie")?.split(";", 1)[0];
if (!cookie) throw new Error("SOCIAL_LIVE_SESSION_COOKIE_MISSING");

const identityPayload = await jsonResponse(await fetch(`${baseUrl}/api/social/session`, {
  headers: { Cookie: cookie },
  cache: "no-store",
}));
if (identityPayload.identity?.userId !== sessionPayload.identity?.userId) {
  throw new Error("SOCIAL_LIVE_SESSION_LOOKUP_MISMATCH");
}

const commentBody = `Independent peer reply ${peerName}`;
const commentPayload = await jsonResponse(await fetch(`${baseUrl}/api/social/discussions/${discussionId}/comments`, {
  method: "POST",
  headers: { Cookie: cookie, "Content-Type": "application/json" },
  body: JSON.stringify({ body: commentBody, parentCommentId: null }),
}));

await jsonResponse(await fetch(`${baseUrl}/api/social/votes`, {
  method: "POST",
  headers: { Cookie: cookie, "Content-Type": "application/json" },
  body: JSON.stringify({ targetType: "DISCUSSION", targetId: discussionId, value: 1 }),
}));

await jsonResponse(await fetch(`${baseUrl}/api/social/reports`, {
  method: "POST",
  headers: { Cookie: cookie, "Content-Type": "application/json" },
  body: JSON.stringify({ targetType: "DISCUSSION", targetId: discussionId, reason: "Live multi-user UI proof" }),
}));

process.stdout.write(`${JSON.stringify({
  ok: true,
  peerUserId: sessionPayload.identity.userId,
  peerName,
  commentId: commentPayload.comment.id,
  commentBody,
  sessionRoundTrip: true,
  voteCommitted: true,
  reportCommitted: true,
})}\n`);
