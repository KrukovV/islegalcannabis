"use client";

import { useEffect, useMemo, useState } from "react";
import type { RuntimeIdentity } from "@/lib/runtimeIdentity";
import styles from "./RuntimeParityBadge.module.css";

type BuildMeta = {
  buildId?: string;
  commit?: string;
  builtAt?: string;
  datasetHash?: string;
  finalSnapshotId?: string;
  snapshotBuiltAt?: string;
  runtimeMode?: string;
  mapRuntime?: string;
  origin?: string;
  expectedOrigin?: string;
};

type Props = {
  runtimeIdentity: RuntimeIdentity;
};

function normalizeRuntimeStamp(runtimeIdentity: RuntimeIdentity) {
  return {
    buildId: String(runtimeIdentity.buildId || "UNCONFIRMED"),
    commit: String(runtimeIdentity.commit || "UNCONFIRMED"),
    builtAt: String(runtimeIdentity.builtAt || "UNCONFIRMED"),
    datasetHash: String(runtimeIdentity.datasetHash || "UNCONFIRMED"),
    finalSnapshotId: String(runtimeIdentity.finalSnapshotId || "UNCONFIRMED"),
    snapshotBuiltAt: String(runtimeIdentity.snapshotBuiltAt || "UNCONFIRMED"),
    runtimeMode: String(runtimeIdentity.runtimeMode || "UNCONFIRMED"),
    mapRuntime: String(runtimeIdentity.mapRuntime || "UNCONFIRMED"),
    origin:
      typeof window !== "undefined" && window.location?.origin
        ? String(window.location.origin)
        : String(runtimeIdentity.expectedOrigin || "UNCONFIRMED"),
    expectedOrigin: String(runtimeIdentity.expectedOrigin || "UNCONFIRMED")
  };
}

function runtimeMatches(left: ReturnType<typeof normalizeRuntimeStamp>, right: BuildMeta) {
  return (
    left.buildId === String(right.buildId || "UNCONFIRMED") &&
    left.commit === String(right.commit || "UNCONFIRMED") &&
    left.builtAt === String(right.builtAt || "UNCONFIRMED") &&
    left.datasetHash === String(right.datasetHash || "UNCONFIRMED") &&
    left.finalSnapshotId === String(right.finalSnapshotId || "UNCONFIRMED") &&
    left.snapshotBuiltAt === String(right.snapshotBuiltAt || "UNCONFIRMED") &&
    left.runtimeMode === String(right.runtimeMode || "UNCONFIRMED") &&
    left.mapRuntime === String(right.mapRuntime || "UNCONFIRMED") &&
    left.origin === String(right.origin || "UNCONFIRMED") &&
    left.expectedOrigin === String(right.expectedOrigin || "UNCONFIRMED")
  );
}

export default function RuntimeParityBadge({ runtimeIdentity }: Props) {
  const [isActual, setIsActual] = useState<boolean | null>(null);
  const [mismatchCount, setMismatchCount] = useState(0);
  const runtimeStamp = useMemo(() => normalizeRuntimeStamp(runtimeIdentity), [runtimeIdentity]);

  useEffect(() => {
    let alive = true;

    const check = async () => {
      try {
        const response = await fetch("/api/build-meta", { cache: "no-store" });
        if (!response.ok || !alive) return;
        const payload = (await response.json()) as BuildMeta;
        const matches = runtimeMatches(runtimeStamp, payload);
        if (!alive) return;
        setIsActual(matches);
        setMismatchCount(matches ? 0 : 1);
      } catch {
        if (!alive) return;
        setIsActual(false);
        setMismatchCount(1);
      }
    };

    void check();
    const timer = window.setInterval(() => {
      void check();
    }, 30_000);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [runtimeStamp]);

  const actual = isActual === true;
  const checking = isActual == null;
  const label = checking ? "Checking" : actual ? "Actual" : "No Actual";

  return (
    <div
      className={`${styles.badge} ${
        checking ? styles.pending : actual ? styles.actual : styles.mismatch
      }`}
      data-testid="runtime-parity-badge"
      data-runtime-actual={checking ? "pending" : actual ? "1" : "0"}
      data-runtime-mismatch-count={String(mismatchCount)}
    >
      {label}
    </div>
  );
}
