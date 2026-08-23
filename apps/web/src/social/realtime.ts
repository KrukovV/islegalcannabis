import type { Sql } from "postgres";
import type { RealtimeProvider, SocialRealtimeEvent } from "./providers";

export const SOCIAL_POSTGRES_CHANNEL = "islegal_social_events";

type PostgresListener = { unlisten(): Promise<void> };
type PayloadSubscriber = (_payload: string) => void;
type SocialRealtimeHubState = {
  listener: PostgresListener | null;
  connecting: Promise<void> | null;
  subscribers: Set<PayloadSubscriber>;
};

type SocialRealtimeGlobal = typeof globalThis & {
  __ISLEGAL_SOCIAL_REALTIME_HUB__?: SocialRealtimeHubState;
};

function realtimeHub() {
  const host = globalThis as SocialRealtimeGlobal;
  host.__ISLEGAL_SOCIAL_REALTIME_HUB__ ||= {
    listener: null,
    connecting: null,
    subscribers: new Set(),
  };
  return host.__ISLEGAL_SOCIAL_REALTIME_HUB__;
}

async function ensureHubListener(sql: Sql, hub: SocialRealtimeHubState) {
  if (hub.listener) return;
  if (!hub.connecting) {
    hub.connecting = (async () => {
      const listener = await sql.listen(SOCIAL_POSTGRES_CHANNEL, (payload) => {
        for (const subscriber of [...hub.subscribers]) subscriber(payload);
      });
      hub.listener = listener;
    })().finally(() => {
      hub.connecting = null;
    });
  }
  await hub.connecting;
}

/**
 * One process-wide PostgreSQL LISTEN feeds all SSE clients. Unsubscribing a
 * viewport removes only its in-memory callback; the single DB listener stays
 * warm so reconnect storms cannot amplify PostgreSQL connections.
 */
export async function subscribeToSocialRealtime(sql: Sql, subscriber: PayloadSubscriber) {
  const hub = realtimeHub();
  hub.subscribers.add(subscriber);
  try {
    await ensureHubListener(sql, hub);
  } catch (error) {
    hub.subscribers.delete(subscriber);
    throw error;
  }
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    hub.subscribers.delete(subscriber);
  };
}

export function getSocialRealtimeMetrics() {
  const hub = realtimeHub();
  return {
    activeSubscribers: hub.subscribers.size,
    listenerConnected: Boolean(hub.listener),
    model: "SHARED_POSTGRES_LISTENER" as const,
  };
}

export class PostgresRealtimeProvider implements RealtimeProvider {
  constructor(private readonly _sql: Sql) {}

  subscribe(topic: string, onEvent: (_event: SocialRealtimeEvent) => void): () => void {
    void topic;
    void onEvent;
    throw new Error("SOCIAL_SERVER_SUBSCRIBE_USE_LISTEN");
  }

  unsubscribe(topic: string) {
    void topic;
  }

  async publish(_topic: string, event: SocialRealtimeEvent) {
    void _topic;
    await this._sql.notify(SOCIAL_POSTGRES_CHANNEL, JSON.stringify(event));
  }
}
