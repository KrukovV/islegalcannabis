import { afterEach, describe, expect, it, vi } from "vitest";
import type { Sql } from "postgres";
import { SOCIAL_POSTGRES_CHANNEL, subscribeToSocialRealtime } from "./realtime";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "__ISLEGAL_SOCIAL_REALTIME_HUB__");
});

describe("Social realtime hub", () => {
  it("fans out through one PostgreSQL LISTEN and removes stale viewport callbacks", async () => {
    let databaseCallback: ((_: string) => void) | null = null;
    const unlistenDatabase = vi.fn(async () => {});
    const listen = vi.fn(async (channel: string, callback: (_: string) => void) => {
      expect(channel).toBe(SOCIAL_POSTGRES_CHANNEL);
      databaseCallback = callback;
      return { unlisten: unlistenDatabase };
    });
    const sql = { listen } as unknown as Sql;
    const first = vi.fn();
    const second = vi.fn();

    const unsubscribeFirst = await subscribeToSocialRealtime(sql, first);
    const unsubscribeSecond = await subscribeToSocialRealtime(sql, second);
    expect(listen).toHaveBeenCalledTimes(1);

    if (!databaseCallback) throw new Error("TEST_DATABASE_CALLBACK_MISSING");
    (databaseCallback as (_: string) => void)("event-1");
    expect(first).toHaveBeenCalledWith("event-1");
    expect(second).toHaveBeenCalledWith("event-1");

    unsubscribeFirst();
    (databaseCallback as (_: string) => void)("event-2");
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenLastCalledWith("event-2");

    unsubscribeSecond();
    expect(unlistenDatabase).not.toHaveBeenCalled();
  });
});
