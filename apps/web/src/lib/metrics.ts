export type MetricCounters = Record<string, number>;

const counters = new Map<string, number>();

export function incrementCounter(name: string) {
  counters.set(name, (counters.get(name) ?? 0) + 1);
}

export function incrementError(code: string) {
  incrementCounter(`errors_${code}`);
}

export function incrementReverseGeocodeMethod(method: string) {
  incrementCounter(`reverse_geocode_method_${method}`);
}

export function getMetricsSnapshot(): MetricCounters {
  return Array.from(counters.entries()).reduce<MetricCounters>((acc, [key, value]) => {
    acc[key] = value;
    return acc;
  }, {});
}
