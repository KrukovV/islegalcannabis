import type { Discussion, MapDiscussionActivity, SocialActor } from "./domain";
import type { PrivateTransport } from "@/dm/domain";
export type { PrivateConversation, PrivateMessageMetadata, PrivateTransport } from "@/dm/domain";

export interface GeoIndexProvider {
  isSafeQueryCell(_cell: string): boolean;
  coarsenToQueryCell(_cell: string): string;
}

export interface UserIdentityProvider {
  getActor(_request: Request): Promise<SocialActor | null>;
}

export interface RealtimeProvider {
  subscribe(_topic: string, _onEvent: (_event: SocialRealtimeEvent) => void): () => void;
  unsubscribe(_topic: string): void;
  publish(_topic: string, _event: SocialRealtimeEvent): Promise<void>;
}

export type SocialRealtimeEvent = {
  id: string;
  type: "DISCUSSION_CREATED" | "DISCUSSION_UPDATED" | "DISCUSSION_REMOVED";
  discussionId: string;
  version: string;
  queryCell?: string | null;
};

export interface NotificationProvider {
  notify(_input: {
    userId: string;
    type: "DISCUSSION_REPLY" | "COMMENT_REPLY" | "VOTE_MILESTONE" | "MODERATION_ACTION" | "DM_RECEIVED" | "DEVICE_SECURITY";
    opaqueEntityId: string;
  }): Promise<void>;
}

export interface ModerationProvider {
  allowCreateDiscussion(_input: { actor: SocialActor; discussion: Discussion }): Promise<{ allowed: boolean; code?: string }>;
}

export interface RateLimitProvider {
  allowDiscussionCreate(_input: { actor: SocialActor; geoCell: string | null }): Promise<{ allowed: boolean; code?: string }>;
}

export const unavailableUserIdentityProvider: UserIdentityProvider = {
  async getActor() {
    return null;
  },
};

export const disabledRealtimeProvider: RealtimeProvider = {
  subscribe() {
    return () => {};
  },
  unsubscribe() {},
  async publish() {},
};

export const disabledModerationProvider: ModerationProvider = {
  async allowCreateDiscussion() {
    return { allowed: false, code: "SOCIAL_WRITE_GUARD_NOT_CONFIGURED" };
  },
};

export const disabledRateLimitProvider: RateLimitProvider = {
  async allowDiscussionCreate() {
    return { allowed: false, code: "SOCIAL_RATE_LIMIT_NOT_CONFIGURED" };
  },
};

export const disabledPrivateTransport: PrivateTransport = {
  capabilities() {
    return {
      name: "DISABLED_PRIVATE_TRANSPORT",
      internet: false,
      nearby: false,
      offlineQueue: false,
      maxPayloadBytes: 0,
      securityLabel: "CANDIDATE_E2E",
    };
  },
  async send(): Promise<never> {
    throw new Error("SOCIAL_DM_DISABLED");
  },
  async receive(): Promise<never> {
    throw new Error("SOCIAL_DM_DISABLED");
  },
  subscribe() {
    return () => {};
  },
  async acknowledge(): Promise<never> {
    throw new Error("SOCIAL_DM_DISABLED");
  },
  async sync(): Promise<never> {
    throw new Error("SOCIAL_DM_DISABLED");
  },
};

export type SocialDiscussionRepository = {
  listDiscussions(_input: {
    type: Discussion["type"];
    queryCells?: string[];
    geoId?: string | null;
    lawId?: string | null;
    newsId?: string | null;
    viewerId?: string | null;
    cursor?: string | null;
    sort: "NEW" | "TOP";
    limit: number;
  }): Promise<Discussion[]>;
  listActiveMapDiscussions(_input: { queryCells: string[]; cursor?: string | null; limit: number }): Promise<Discussion[]>;
  listActiveMapActivity(_input: { queryCells: string[]; limit: number }): Promise<MapDiscussionActivity[]>;
  createDiscussion(_input: Discussion): Promise<Discussion>;
};
