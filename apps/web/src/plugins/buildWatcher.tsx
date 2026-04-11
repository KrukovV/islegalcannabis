"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const CHECK_MS = 30_000;
const DISMISSED_BUILD_KEY = "build-watcher-dismissed-stamp";
const PENDING_BUILD_KEY = "build-watcher-pending-stamp";
const REFRESH_PARAM = "__runtime_refresh";

type BuildMeta = {
  buildId?: string;
  commit?: string;
  builtAt?: string;
  datasetHash?: string;
  finalSnapshotId?: string;
  snapshotBuiltAt?: string;
};

function getClientRuntimeStamp(): string {
  if (typeof window === "undefined") {
    return "unknown";
  }
  const nextData = (window as unknown as { __NEXT_DATA__?: { buildId?: string } }).__NEXT_DATA__;
  const node = document.querySelector("[data-testid='runtime-stamp']");
  const parts = [
    String(node?.getAttribute("data-build-id") || nextData?.buildId || "dev"),
    String(node?.getAttribute("data-commit") || "unknown"),
    String(node?.getAttribute("data-built-at") || "UNCONFIRMED"),
    String(node?.getAttribute("data-dataset-hash") || "UNCONFIRMED"),
    String(node?.getAttribute("data-final-snapshot-id") || "UNCONFIRMED"),
    String(node?.getAttribute("data-snapshot-built-at") || "UNCONFIRMED")
  ];
  return parts.join("|");
}

function resetClientRuntimePrefetch() {
  if (typeof window === "undefined") {
    return;
  }
  const host = window as typeof window & {
    __NEW_MAP_PREFETCH__?: unknown;
  };
  delete host.__NEW_MAP_PREFETCH__;
}

async function waitForRuntimeStamp(expectedStamp: string, timeoutMs = 5_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (getClientRuntimeStamp() === expectedStamp) {
      return true;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 120));
  }
  return false;
}

function buildRefreshUrl(expectedStamp: string) {
  if (typeof window === "undefined") {
    return "/";
  }
  const url = new URL(window.location.href);
  url.searchParams.set(REFRESH_PARAM, `${Date.now()}-${expectedStamp.slice(0, 12)}`);
  return url.toString();
}

export default function BuildWatcher() {
  const router = useRouter();
  const isProduction = process.env.NODE_ENV === "production";
  const [nextRuntimeStamp, setNextRuntimeStamp] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const isNewMapRoute = typeof window !== "undefined" && window.location.pathname.startsWith("/new-map");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const pendingStamp = window.sessionStorage.getItem(PENDING_BUILD_KEY);
    const currentStamp = getClientRuntimeStamp();
    if (pendingStamp && pendingStamp === currentStamp) {
      window.sessionStorage.removeItem(PENDING_BUILD_KEY);
      const url = new URL(window.location.href);
      if (url.searchParams.has(REFRESH_PARAM)) {
        url.searchParams.delete(REFRESH_PARAM);
        window.history.replaceState(null, "", url.toString());
      }
      setNextRuntimeStamp(null);
      setDismissed(false);
    }
  }, []);

  const handleApplyUpdate = useCallback(async () => {
    if (!nextRuntimeStamp || refreshing) {
      return;
    }
    setRefreshing(true);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(DISMISSED_BUILD_KEY);
        window.sessionStorage.setItem(PENDING_BUILD_KEY, nextRuntimeStamp);
      }
      resetClientRuntimePrefetch();
      router.refresh();
      const synced = await waitForRuntimeStamp(nextRuntimeStamp, 1_500);
      if (synced) {
        if (typeof window !== "undefined") {
          window.sessionStorage.removeItem(PENDING_BUILD_KEY);
        }
        setNextRuntimeStamp(null);
        setDismissed(false);
        return;
      }
      resetClientRuntimePrefetch();
      if (typeof window !== "undefined") {
        window.location.assign(buildRefreshUrl(nextRuntimeStamp));
        return;
      }
    } finally {
      setRefreshing(false);
    }
  }, [nextRuntimeStamp, refreshing, router]);

  useEffect(() => {
    let alive = true;

    const check = async () => {
      try {
        const res = await fetch("/api/build-meta", { cache: "no-store" });
        if (!res.ok || !alive) {
          return;
        }
        const payload = (await res.json()) as BuildMeta;
        const observed = [
          String(payload.buildId || "dev"),
          String(payload.commit || "unknown"),
          String(payload.builtAt || "UNCONFIRMED"),
          String(payload.datasetHash || "UNCONFIRMED"),
          String(payload.finalSnapshotId || "UNCONFIRMED"),
          String(payload.snapshotBuiltAt || "UNCONFIRMED")
        ].join("|");
        const currentRuntimeStamp = getClientRuntimeStamp();
        if (!observed || observed === currentRuntimeStamp) {
          setNextRuntimeStamp(null);
          setDismissed(false);
          return;
        }
        const dismissedStamp =
          typeof window !== "undefined" ? window.localStorage.getItem(DISMISSED_BUILD_KEY) : null;
        if (dismissedStamp === observed) {
          setDismissed(true);
          setNextRuntimeStamp(observed);
          return;
        }
        setDismissed(false);
        setNextRuntimeStamp(observed);
      } catch {
        // build check is best-effort only
      }
    };

    const timer = window.setInterval(() => {
      void check();
    }, CHECK_MS);
    void check();

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  if (isProduction || isNewMapRoute || !nextRuntimeStamp || dismissed) {
    return null;
  }

  return (
    <div
      data-testid="build-update-banner"
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 1200,
        maxWidth: 360,
        borderRadius: 12,
        border: "1px solid rgba(20,40,30,0.2)",
        background: "rgba(255,255,255,0.96)",
        boxShadow: "0 10px 24px rgba(0,0,0,0.14)",
        padding: "12px 14px",
        color: "#1f2937"
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Доступно обновление</div>
      <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 10 }}>
        Появилась новая сборка приложения. Обновите страницу, когда будет удобно.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => {
            void handleApplyUpdate();
          }}
          disabled={refreshing}
          style={{
            borderRadius: 8,
            border: "1px solid rgba(20,40,30,0.2)",
            padding: "6px 10px",
            background: "#0f766e",
            color: "#fff",
            cursor: refreshing ? "wait" : "pointer",
            opacity: refreshing ? 0.72 : 1
          }}
        >
          {refreshing ? "Обновляем…" : "Обновить"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (nextRuntimeStamp && typeof window !== "undefined") {
              window.localStorage.setItem(DISMISSED_BUILD_KEY, nextRuntimeStamp);
            }
            setDismissed(true);
          }}
          style={{
            borderRadius: 8,
            border: "1px solid rgba(20,40,30,0.2)",
            padding: "6px 10px",
            background: "transparent",
            color: "#1f2937",
            cursor: refreshing ? "default" : "pointer",
            opacity: refreshing ? 0.5 : 1
          }}
          disabled={refreshing}
        >
          Позже
        </button>
      </div>
    </div>
  );
}
