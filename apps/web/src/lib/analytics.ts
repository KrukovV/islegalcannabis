export type AnalyticsEvent =
  | "check_performed"
  | "paraphrase_generated"
  | "upgrade_clicked";

type Counter = {
  count: number;
  updatedAt: number;
};

const counters = new Map<AnalyticsEvent, Counter>();

export function logEvent(event: AnalyticsEvent) {
  const now = Date.now();
  const entry = counters.get(event);
  if (!entry) {
    counters.set(event, { count: 1, updatedAt: now });
    return;
  }
  entry.count += 1;
  entry.updatedAt = now;
}

export function getCountersSnapshot() {
  return Array.from(counters.entries()).reduce<Record<string, Counter>>(
    (acc, [key, value]) => {
      acc[key] = { ...value };
      return acc;
    },
    {}
  );
}
