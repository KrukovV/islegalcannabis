"use client";

import { useEffect, useMemo, useState } from "react";

const CHECK_MS = 30_000;

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
    String(nextData?.buildId || "dev"),
    String(node?.getAttribute("data-commit") || "unknown"),
    String(node?.getAttribute("data-built-at") || "UNCONFIRMED"),
    String(node?.getAttribute("data-dataset-hash") || "UNCONFIRMED"),
    String(node?.getAttribute("data-final-snapshot-id") || "UNCONFIRMED"),
    String(node?.getAttribute("data-snapshot-built-at") || "UNCONFIRMED")
  ];
  return parts.join("|");
}

export default function BuildWatcher() {
  const isProduction = process.env.NODE_ENV === "production";
  const initialRuntimeStamp = useMemo(() => getClientRuntimeStamp(), []);
  const [nextRuntimeStamp, setNextRuntimeStamp] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const isNewMapRoute = typeof window !== "undefined" && window.location.pathname.startsWith("/new-map");

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
        if (!observed || observed === initialRuntimeStamp) {
          return;
        }
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
  }, [initialRuntimeStamp]);

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
          onClick={() => window.location.reload()}
          style={{
            borderRadius: 8,
            border: "1px solid rgba(20,40,30,0.2)",
            padding: "6px 10px",
            background: "#0f766e",
            color: "#fff",
            cursor: "pointer"
          }}
        >
          Обновить
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          style={{
            borderRadius: 8,
            border: "1px solid rgba(20,40,30,0.2)",
            padding: "6px 10px",
            background: "transparent",
            color: "#1f2937",
            cursor: "pointer"
          }}
        >
          Позже
        </button>
      </div>
    </div>
  );
}
