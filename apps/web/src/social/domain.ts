export const DISCUSSION_TYPES = ["MAP", "GEO", "NEWS", "LAW", "EVENT"] as const;
export type DiscussionType = (typeof DISCUSSION_TYPES)[number];

export const DISCUSSION_STATUSES = ["ACTIVE", "HIDDEN", "REMOVED", "QUARANTINED", "EXPIRED"] as const;
export type DiscussionStatus = (typeof DISCUSSION_STATUSES)[number];

export type SocialGeoAttachment = {
  geoCell: string;
  geoResolution: number;
  geoQueryCell: string;
};

/**
 * A public place deliberately attached to content. It is never author
 * presence, current GPS, or a value inferred from a GeoChat cell.
 */
export type ExplicitPublicPostLocation = {
  kind: "PLACE" | "EVENT" | "SELECTED_POINT";
  publiclyConfirmed: true;
};

export type Discussion = {
  id: string;
  type: DiscussionType;
  authorId: string;
  authorDisplayName: string;
  geoId: string | null;
  geo: SocialGeoAttachment | null;
  lawId: string | null;
  newsId: string | null;
  sourceId: string | null;
  title: string | null;
  body: string;
  language: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  status: DiscussionStatus;
  replyCount: number;
  voteScore: number;
  version: string;
};

export type MapDiscussionActivity = {
  geoCell: string;
  geoResolution: number;
  activeDiscussionCount: number;
  latestActivityAt: string;
};

export type CreateDiscussionInput = {
  type: DiscussionType;
  geoId?: string | null;
  geo?: Pick<SocialGeoAttachment, "geoCell" | "geoResolution"> | null;
  lawId?: string | null;
  newsId?: string | null;
  sourceId?: string | null;
  title?: string | null;
  body: string;
  language?: string;
  eventEndsAt?: string | null;
};

export type SocialActor = {
  userId: string;
  roles: readonly ("USER" | "MODERATOR" | "ADMIN")[];
};

export type Comment = {
  id: string;
  discussionId: string;
  authorId: string;
  authorDisplayName: string;
  parentCommentId: string | null;
  body: string;
  status: DiscussionStatus;
  voteScore: number;
  createdAt: string;
  updatedAt: string;
};

export type Vote = {
  targetType: "DISCUSSION" | "COMMENT";
  targetId: string;
  userId: string;
  value: -1 | 1;
  createdAt: string;
};

export type Report = {
  id: string;
  reporterId: string;
  targetType: "DISCUSSION" | "COMMENT" | "USER";
  targetId: string;
  reason: string;
  createdAt: string;
};

export type UserSocialProfile = {
  userId: string;
  displayName: string | null;
  bio: string | null;
  discoverableNearby: boolean;
  createdAt: string;
  updatedAt: string;
};

export const MAP_DISCUSSION_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
export const MAP_DISCUSSION_MAX_TTL_MS = 72 * 60 * 60 * 1000;

export function resolveDiscussionExpiry(input: CreateDiscussionInput, now = new Date()) {
  if (input.type === "MAP") {
    return new Date(now.getTime() + MAP_DISCUSSION_DEFAULT_TTL_MS).toISOString();
  }
  if (input.type === "EVENT") return input.eventEndsAt ?? null;
  return null;
}

export function validateDiscussionInput(input: CreateDiscussionInput) {
  if (!DISCUSSION_TYPES.includes(input.type)) throw new Error("SOCIAL_DISCUSSION_TYPE_INVALID");
  if (!input.body.trim() || input.body.length > 8_000) throw new Error("SOCIAL_DISCUSSION_BODY_INVALID");
  if (input.title && input.title.length > 240) throw new Error("SOCIAL_DISCUSSION_TITLE_INVALID");
  if (input.type === "MAP" && !input.geo) throw new Error("SOCIAL_MAP_GEO_CELL_REQUIRED");
  if (input.type !== "MAP" && input.geo) throw new Error("SOCIAL_GEO_ATTACHMENT_TYPE_INVALID");
  if (input.type === "LAW" && !input.lawId) throw new Error("SOCIAL_LAW_ID_REQUIRED");
  if (input.type === "NEWS" && !input.newsId) throw new Error("SOCIAL_NEWS_ID_REQUIRED");
  if (input.type === "EVENT" && input.eventEndsAt && !Number.isFinite(Date.parse(input.eventEndsAt))) {
    throw new Error("SOCIAL_EVENT_EXPIRY_INVALID");
  }
}
