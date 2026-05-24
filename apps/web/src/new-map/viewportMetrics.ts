type MobileQaVisualViewportSnapshot = Partial<{
  width: number;
  height: number;
  offsetTop: number;
  offsetLeft: number;
  scale: number;
}>;

type MobileQaVisualViewportController = {
  get?: () => MobileQaVisualViewportSnapshot | null | undefined;
  subscribe?: (_listener: () => void) => (() => void) | void;
};

export type VisualViewportSnapshot = {
  width: number;
  height: number;
  offsetTop: number;
  offsetLeft: number;
  scale: number;
};

function normalizeMetric(value: unknown, fallback: number) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

export function readVisualViewportSnapshot(): VisualViewportSnapshot {
  if (typeof window === "undefined") {
    return {
      width: 0,
      height: 0,
      offsetTop: 0,
      offsetLeft: 0,
      scale: 1
    };
  }

  const host = window as Window & {
    __MOBILE_QA_VISUAL_VIEWPORT__?: MobileQaVisualViewportController;
  };
  const qaSnapshot = host.__MOBILE_QA_VISUAL_VIEWPORT__?.get?.();
  if (qaSnapshot) {
    return {
      width: normalizeMetric(qaSnapshot.width, window.innerWidth),
      height: normalizeMetric(qaSnapshot.height, window.innerHeight),
      offsetTop: normalizeMetric(qaSnapshot.offsetTop, 0),
      offsetLeft: normalizeMetric(qaSnapshot.offsetLeft, 0),
      scale: normalizeMetric(qaSnapshot.scale, 1)
    };
  }

  const viewport = window.visualViewport;
  return {
    width: normalizeMetric(viewport?.width, window.innerWidth),
    height: normalizeMetric(viewport?.height, window.innerHeight),
    offsetTop: normalizeMetric(viewport?.offsetTop, 0),
    offsetLeft: normalizeMetric(viewport?.offsetLeft, 0),
    scale: normalizeMetric(viewport?.scale, 1)
  };
}

export function readVisualViewportKeyboardOffset() {
  if (typeof window === "undefined") return 0;
  const snapshot = readVisualViewportSnapshot();
  return Math.max(0, Math.round(window.innerHeight - snapshot.height - snapshot.offsetTop));
}

export function subscribeToVisualViewportChanges(listener: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const host = window as Window & {
    __MOBILE_QA_VISUAL_VIEWPORT__?: MobileQaVisualViewportController;
  };
  const cleanups: Array<() => void> = [];
  const handleChange = () => listener();

  const unsubscribeOverride = host.__MOBILE_QA_VISUAL_VIEWPORT__?.subscribe?.(handleChange);
  if (typeof unsubscribeOverride === "function") {
    cleanups.push(unsubscribeOverride);
  }

  const viewport = window.visualViewport;
  if (viewport) {
    viewport.addEventListener("resize", handleChange);
    viewport.addEventListener("scroll", handleChange);
    cleanups.push(() => viewport.removeEventListener("resize", handleChange));
    cleanups.push(() => viewport.removeEventListener("scroll", handleChange));
  }

  window.addEventListener("resize", handleChange);
  window.addEventListener("orientationchange", handleChange);
  cleanups.push(() => window.removeEventListener("resize", handleChange));
  cleanups.push(() => window.removeEventListener("orientationchange", handleChange));

  return () => {
    for (const cleanup of cleanups.reverse()) {
      cleanup();
    }
  };
}
