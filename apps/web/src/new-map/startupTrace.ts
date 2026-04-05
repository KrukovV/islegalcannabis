"use client";

const FIRST_VISUAL_EVENT = "new-map:first-visual-ready";

type TracePayload = {
  t0?: number;
  marks?: Record<string, number>;
  metrics?: Record<string, number>;
};

type TraceWindow = Window & {
  __NEW_MAP_TRACE__?: TracePayload;
  __NEW_MAP_FIRST_VISUAL_READY__?: boolean;
};

function getHost(): TraceWindow | null {
  if (typeof window === "undefined") return null;
  return window as TraceWindow;
}

function ensureTrace(host: TraceWindow): TracePayload {
  const current = host.__NEW_MAP_TRACE__ || {
    t0: performance.now(),
    marks: {},
    metrics: {}
  };
  current.t0 = typeof current.t0 === "number" ? current.t0 : performance.now();
  current.marks = current.marks || {};
  current.metrics = current.metrics || {};
  host.__NEW_MAP_TRACE__ = current;
  return current;
}

export function markNewMapTrace(name: string) {
  const host = getHost();
  if (!host) return;
  const trace = ensureTrace(host);
  if (typeof trace.marks?.[name] === "number") return;
  trace.marks![name] = performance.now();
  window.console.debug(`[new-map-trace] ${name}=${Math.round(trace.marks![name] - trace.t0!)}`);
}

export function setNewMapMetric(name: string, value: number) {
  const host = getHost();
  if (!host) return;
  const trace = ensureTrace(host);
  trace.metrics![name] = value;
}

export function emitFirstVisualReady() {
  const host = getHost();
  if (!host || host.__NEW_MAP_FIRST_VISUAL_READY__) return;
  host.__NEW_MAP_FIRST_VISUAL_READY__ = true;
  markNewMapTrace("NM_T7_FIRST_FILL_RENDERED");
  host.dispatchEvent(new CustomEvent(FIRST_VISUAL_EVENT));
}

export function hasFirstVisualReady() {
  const host = getHost();
  return Boolean(host?.__NEW_MAP_FIRST_VISUAL_READY__);
}

export function onFirstVisualReady(callback: () => void) {
  const host = getHost();
  if (!host) return () => {};
  if (host.__NEW_MAP_FIRST_VISUAL_READY__) {
    callback();
    return () => {};
  }
  const listener = () => callback();
  host.addEventListener(FIRST_VISUAL_EVENT, listener, { once: true });
  return () => host.removeEventListener(FIRST_VISUAL_EVENT, listener);
}
