"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const CHECK_MS = 30_000;
const DISMISSED_BUILD_KEY = "build-watcher-dismissed-stamp";
const PENDING_BUILD_KEY = "build-watcher-pending-stamp";
const PENDING_RELOAD_COUNT_KEY = "build-watcher-pending-reload-count";
const ACTIVE_BUILD_KEY = "build-watcher-active-stamp";
const REFRESH_PARAM = "__runtime_refresh";
const MAX_PENDING_RELOADS = 3;

type BuildMeta = {
  buildId?: string;
  commit?: string;
  builtAt?: string;
  datasetHash?: string;
  finalSnapshotId?: string;
  snapshotBuiltAt?: string;
  runtimeMode?: string;
  mapRuntime?: string;
  expectedOrigin?: string;
  at?: string;
};

type RuntimeStamp = {
  buildId: string;
  commit: string;
  builtAt: string;
  datasetHash: string;
  finalSnapshotId: string;
  snapshotBuiltAt: string;
  runtimeMode: string;
  mapRuntime: string;
  origin: string;
  expectedOrigin: string;
};

function normalizePayload(payload: BuildMeta): RuntimeStamp {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? String(window.location.origin)
      : String(payload.expectedOrigin || "UNCONFIRMED");
  return {
    buildId: String(payload.buildId || "dev"),
    commit: String(payload.commit || "unknown"),
    builtAt: String(payload.builtAt || "UNCONFIRMED"),
    datasetHash: String(payload.datasetHash || "UNCONFIRMED"),
    finalSnapshotId: String(payload.finalSnapshotId || "UNCONFIRMED"),
    snapshotBuiltAt: String(payload.snapshotBuiltAt || "UNCONFIRMED"),
    runtimeMode: String(payload.runtimeMode || "UNCONFIRMED"),
    mapRuntime: String(payload.mapRuntime || "UNCONFIRMED"),
    origin,
    expectedOrigin: String(payload.expectedOrigin || origin),
  };
}

function stampToKey(stamp: RuntimeStamp): string {
  return [
    stamp.buildId,
    stamp.commit,
    stamp.builtAt,
    stamp.datasetHash,
    stamp.finalSnapshotId,
    stamp.snapshotBuiltAt,
    stamp.runtimeMode,
    stamp.mapRuntime,
    stamp.origin,
    stamp.expectedOrigin,
  ].join("|");
}

function getClientRuntimeStamp(): RuntimeStamp | null {
  if (typeof window === "undefined") {
    return null;
  }
  const nextData = (
    window as unknown as { __NEXT_DATA__?: { buildId?: string } }
  ).__NEXT_DATA__;
  const node = document.querySelector("[data-testid='runtime-stamp']");
  if (!node) {
    return null;
  }
  return {
    buildId: String(
      node?.getAttribute("data-build-id") || nextData?.buildId || "dev",
    ),
    commit: String(node?.getAttribute("data-commit") || "unknown"),
    builtAt: String(node?.getAttribute("data-built-at") || "UNCONFIRMED"),
    datasetHash: String(
      node?.getAttribute("data-dataset-hash") || "UNCONFIRMED",
    ),
    finalSnapshotId: String(
      node?.getAttribute("data-final-snapshot-id") || "UNCONFIRMED",
    ),
    snapshotBuiltAt: String(
      node?.getAttribute("data-snapshot-built-at") || "UNCONFIRMED",
    ),
    runtimeMode: String(
      node?.getAttribute("data-runtime-mode") || "UNCONFIRMED",
    ),
    mapRuntime: String(node?.getAttribute("data-map-runtime") || "UNCONFIRMED"),
    origin: String(window.location.origin || "UNCONFIRMED"),
    expectedOrigin: String(
      node?.getAttribute("data-expected-origin") ||
        window.location.origin ||
        "UNCONFIRMED",
    ),
  };
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

function buildRefreshUrl(expectedStamp: string) {
  if (typeof window === "undefined") {
    return "/";
  }
  const url = new URL(window.location.href);
  url.searchParams.set(
    REFRESH_PARAM,
    `${Date.now()}-${expectedStamp.slice(0, 12)}`,
  );
  return url.toString();
}

function removeRefreshParam() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(REFRESH_PARAM)) return;
  url.searchParams.delete(REFRESH_PARAM);
  window.history.replaceState(null, "", url.toString());
}

function formatVisibleRuntimeStamp(payload: BuildMeta) {
  return [
    `BUILD_ID=${String(payload.buildId || "UNCONFIRMED")}`,
    `COMMIT=${String(payload.commit || "UNCONFIRMED")}`,
    `BUILT=${String(payload.builtAt || "UNCONFIRMED")}`,
    `SNAPSHOT=${String(payload.finalSnapshotId || "UNCONFIRMED")}`,
    `DATASET=${String(payload.datasetHash || "UNCONFIRMED")}`,
    `MODE=${String(payload.runtimeMode || "UNCONFIRMED").toUpperCase()}`,
    "MAP=NONE",
    `RUNTIME=${String(payload.mapRuntime || "UNCONFIRMED").toUpperCase()}`,
  ].join(" · ");
}

function syncRuntimeDom(payload: BuildMeta) {
  if (typeof window === "undefined") {
    return;
  }
  const runtimeNode = document.querySelector("[data-testid='runtime-stamp']");
  runtimeNode?.setAttribute(
    "data-build-id",
    String(payload.buildId || "UNCONFIRMED"),
  );
  runtimeNode?.setAttribute(
    "data-commit",
    String(payload.commit || "UNCONFIRMED"),
  );
  runtimeNode?.setAttribute(
    "data-built-at",
    String(payload.builtAt || "UNCONFIRMED"),
  );
  runtimeNode?.setAttribute(
    "data-dataset-hash",
    String(payload.datasetHash || "UNCONFIRMED"),
  );
  runtimeNode?.setAttribute(
    "data-final-snapshot-id",
    String(payload.finalSnapshotId || "UNCONFIRMED"),
  );
  runtimeNode?.setAttribute(
    "data-snapshot-built-at",
    String(payload.snapshotBuiltAt || "UNCONFIRMED"),
  );
  runtimeNode?.setAttribute(
    "data-runtime-mode",
    String(payload.runtimeMode || "UNCONFIRMED"),
  );
  runtimeNode?.setAttribute(
    "data-map-runtime",
    String(payload.mapRuntime || "UNCONFIRMED"),
  );
  runtimeNode?.setAttribute(
    "data-expected-origin",
    String(payload.expectedOrigin || window.location.origin),
  );

  const visibleNode = document.querySelector(
    "[data-testid='visible-runtime-stamp']",
  );
  if (visibleNode) {
    visibleNode.textContent = formatVisibleRuntimeStamp(payload);
  }
}

function runtimeMatches(left: RuntimeStamp, right: RuntimeStamp) {
  return stampToKey(left) === stampToKey(right);
}

export default function BuildWatcher() {
  const isProduction = process.env.NODE_ENV === "production";
  const pathname = usePathname();
  const showPersistentAuditStatus =
    pathname === "/wiki-truth" || pathname === "/trust-view";
  const [nextRuntimeStamp, setNextRuntimeStamp] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [observedMeta, setObservedMeta] = useState<BuildMeta | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    let cancelled = false;
    const pendingStamp = window.sessionStorage.getItem(PENDING_BUILD_KEY);
    const runtimeStamp = getClientRuntimeStamp();
    const currentStamp = runtimeStamp
      ? stampToKey(runtimeStamp)
      : window.sessionStorage.getItem(ACTIVE_BUILD_KEY);
    if (pendingStamp && pendingStamp === currentStamp) {
      window.sessionStorage.removeItem(PENDING_BUILD_KEY);
      window.sessionStorage.removeItem(PENDING_RELOAD_COUNT_KEY);
      removeRefreshParam();
      queueMicrotask(() => {
        if (cancelled) return;
        setNextRuntimeStamp(null);
        setDismissed(false);
        setRefreshing(false);
      });
      return () => {
        cancelled = true;
      };
    }
    if (
      pendingStamp &&
      runtimeStamp &&
      currentStamp &&
      pendingStamp !== currentStamp
    ) {
      const attempts = Number(
        window.sessionStorage.getItem(PENDING_RELOAD_COUNT_KEY) || "0",
      );
      if (attempts < MAX_PENDING_RELOADS) {
        window.sessionStorage.setItem(
          PENDING_RELOAD_COUNT_KEY,
          String(attempts + 1),
        );
        resetClientRuntimePrefetch();
        window.location.replace(buildRefreshUrl(pendingStamp));
        return;
      }
      void fetch("/api/build-meta", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload: BuildMeta | null) => {
          if (!payload) return;
          syncRuntimeDom(payload);
        })
        .finally(() => {
          window.sessionStorage.removeItem(PENDING_BUILD_KEY);
          window.sessionStorage.removeItem(PENDING_RELOAD_COUNT_KEY);
          removeRefreshParam();
          if (!cancelled) setRefreshing(false);
        });
    }
    return () => {
      cancelled = true;
    };
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
        window.sessionStorage.setItem(PENDING_RELOAD_COUNT_KEY, "0");
        resetClientRuntimePrefetch();
        const refreshUrl = buildRefreshUrl(nextRuntimeStamp);
        window.location.replace(refreshUrl);
        return;
      }
    } finally {
      setRefreshing(false);
    }
  }, [nextRuntimeStamp, refreshing]);

  const handleManualReload = useCallback(async () => {
    if (refreshing) return;
    if (nextRuntimeStamp) {
      await handleApplyUpdate();
      return;
    }
    setRefreshing(true);
    resetClientRuntimePrefetch();
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }, [handleApplyUpdate, nextRuntimeStamp, refreshing]);

  useEffect(() => {
    let alive = true;

    const check = async () => {
      try {
        const res = await fetch("/api/build-meta", { cache: "no-store" });
        if (!res.ok || !alive) {
          if (alive) setCheckFailed(true);
          return;
        }
        const payload = (await res.json()) as BuildMeta;
        setObservedMeta(payload);
        setLastCheckedAt(new Date().toISOString());
        setCheckFailed(false);
        const observedStamp = normalizePayload(payload);
        const observed = stampToKey(observedStamp);
        const currentRuntimeStamp = getClientRuntimeStamp();
        const activeStamp = currentRuntimeStamp
          ? stampToKey(currentRuntimeStamp)
          : typeof window !== "undefined"
            ? window.sessionStorage.getItem(ACTIVE_BUILD_KEY)
            : null;
        if (!activeStamp && typeof window !== "undefined") {
          window.sessionStorage.setItem(ACTIVE_BUILD_KEY, observed);
          setNextRuntimeStamp(null);
          setDismissed(false);
          return;
        }
        if (
          !observed ||
          activeStamp === observed ||
          (currentRuntimeStamp &&
            runtimeMatches(observedStamp, currentRuntimeStamp))
        ) {
          setNextRuntimeStamp(null);
          setDismissed(false);
          return;
        }
        const pendingStamp =
          typeof window !== "undefined"
            ? window.sessionStorage.getItem(PENDING_BUILD_KEY)
            : null;
        const completedRefreshNavigation =
          typeof window !== "undefined" &&
          new URL(window.location.href).searchParams.has(REFRESH_PARAM);
        if (
          pendingStamp &&
          (pendingStamp === observed ||
            (!currentRuntimeStamp && completedRefreshNavigation))
        ) {
          syncRuntimeDom(payload);
          window.sessionStorage.setItem(ACTIVE_BUILD_KEY, observed);
          window.sessionStorage.removeItem(PENDING_BUILD_KEY);
          window.sessionStorage.removeItem(PENDING_RELOAD_COUNT_KEY);
          removeRefreshParam();
          setNextRuntimeStamp(null);
          setDismissed(false);
          setRefreshing(false);
          return;
        }
        const dismissedStamp =
          typeof window !== "undefined"
            ? window.localStorage.getItem(DISMISSED_BUILD_KEY)
            : null;
        if (dismissedStamp === observed) {
          setDismissed(true);
          setNextRuntimeStamp(observed);
          return;
        }
        setDismissed(false);
        setNextRuntimeStamp(observed);
      } catch {
        if (alive) setCheckFailed(true);
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

  if (
    isProduction ||
    (!showPersistentAuditStatus && (!nextRuntimeStamp || dismissed))
  ) {
    return null;
  }

  const freshnessStatus = nextRuntimeStamp
    ? dismissed
      ? "UPDATE_DEFERRED"
      : "UPDATE_AVAILABLE"
    : checkFailed
      ? "CHECK_FAILED"
      : observedMeta
        ? "CURRENT"
        : "CHECKING";
  const title =
    freshnessStatus === "UPDATE_AVAILABLE"
      ? "Доступно обновление"
      : freshnessStatus === "UPDATE_DEFERRED"
        ? "Обновление отложено"
        : freshnessStatus === "CURRENT"
          ? "Страница актуальна"
          : freshnessStatus === "CHECK_FAILED"
            ? "Актуальность не подтверждена"
            : "Проверяем актуальность…";
  const checkedLabel = lastCheckedAt
    ? new Date(lastCheckedAt).toLocaleTimeString("ru-RU")
    : "ещё не проверено";

  return (
    <div
      data-testid="build-update-banner"
      data-freshness-status={freshnessStatus}
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
        color: "#1f2937",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 10 }}>
        {nextRuntimeStamp
          ? "Появилась новая сборка приложения. Кнопка выполнит полную навигационную перезагрузку."
          : checkFailed
            ? "Не удалось проверить /api/build-meta. Текущая версия не объявляется актуальной."
            : `Проверено: ${checkedLabel}. Сборка: ${String(observedMeta?.buildId || "—")}; коммит: ${String(observedMeta?.commit || "—")}; снимок: ${String(observedMeta?.finalSnapshotId || "—")}.`}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => {
            void handleManualReload();
          }}
          disabled={refreshing}
          style={{
            borderRadius: 8,
            border: "1px solid rgba(20,40,30,0.2)",
            padding: "6px 10px",
            background: "#0f766e",
            color: "#fff",
            cursor: refreshing ? "wait" : "pointer",
            opacity: refreshing ? 0.72 : 1,
          }}
        >
          {refreshing ? "Обновляем…" : "Обновить"}
        </button>
        {nextRuntimeStamp ? <button
          type="button"
          onClick={() => {
            if (nextRuntimeStamp && typeof window !== "undefined") {
              window.localStorage.setItem(
                DISMISSED_BUILD_KEY,
                nextRuntimeStamp,
              );
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
            opacity: refreshing ? 0.5 : 1,
          }}
          disabled={refreshing}
        >
          Позже
        </button> : null}
      </div>
    </div>
  );
}
