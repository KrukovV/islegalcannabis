"use client";
import { useEffect, useRef, useState } from "react";
import RuntimeParityBadge from "@/app/_components/RuntimeParityBadge";
import type { RuntimeIdentity } from "@/lib/runtimeIdentity";
import { attachHoverController } from "./hoverController";
import { createMap } from "./createMap";
import type { LegalCountryCollection } from "./map.types";
import styles from "./MapRoot.module.css";

type Props = {
  countriesUrl: string;
  visibleStamp: string;
  runtimeIdentity: RuntimeIdentity;
};

type NewMapDebug = {
  mounted: boolean;
  hoveredId: string | null;
  hoverSwitchCount: number;
  hoverStateOwner: "feature-state";
  countriesUrl: string;
  map?: import("maplibre-gl").Map | null;
  labelGroups?: Record<string, string[]>;
  lastPointerLng?: number | null;
};

function setDebugState(partial: Partial<NewMapDebug>) {
  const host = globalThis as typeof globalThis & {
    __NEW_MAP_DEBUG__?: NewMapDebug;
  };
  const current = host.__NEW_MAP_DEBUG__ || {
    mounted: false,
    hoveredId: null,
    hoverSwitchCount: 0,
    hoverStateOwner: "feature-state",
    countriesUrl: "",
  };
  Object.assign(current, partial);
  host.__NEW_MAP_DEBUG__ = current;
}

export default function MapRoot({ countriesUrl, visibleStamp, runtimeIdentity }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};

    async function mount() {
      if (!containerRef.current) return;
      try {
        const [countriesResponse, adminResponse] = await Promise.all([
          fetch(countriesUrl, { cache: "no-store" }),
          fetch("/api/new-map/admin-boundaries", { cache: "no-store" })
        ]);
        if (!countriesResponse.ok) {
          throw new Error(`countries_fetch_failed:${countriesResponse.status}`);
        }
        if (!adminResponse.ok) {
          throw new Error(`admin_boundaries_fetch_failed:${adminResponse.status}`);
        }
        const countries = (await countriesResponse.json()) as LegalCountryCollection;
        const adminBoundaries = await adminResponse.json();
        if (cancelled || !containerRef.current) return;
        const runtime = createMap(containerRef.current, countries, adminBoundaries);
        await runtime.ready;
        if (cancelled) {
          runtime.destroy();
          return;
        }
        const hover = attachHoverController(runtime.map);
        setDebugState({ mounted: true, countriesUrl, map: runtime.map });
        cleanup = () => {
          hover.destroy();
          runtime.destroy();
          setDebugState({ mounted: false, hoveredId: null, map: null });
        };
      } catch (mountError) {
        setError(mountError instanceof Error ? mountError.message : "new_map_boot_failed");
      }
    }

    mount();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [countriesUrl]);

  return (
    <section className={styles.root} data-testid="new-map-root">
      <div className={styles.overlay}>
        <div className={styles.card}>
          <div className={styles.eyebrow}>New Map Skeleton</div>
          <h2>MapLibre render + feature-state hover</h2>
          <p>MapLibre owns render. Leaflet is reduced to pointer-stream glue only. Truth colors still come from the current SSOT snapshot.</p>
        </div>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <strong>Runtime</strong>
            <RuntimeParityBadge runtimeIdentity={runtimeIdentity} />
          </div>
          <div className={styles.runtime}>{visibleStamp}</div>
          <div className={styles.meta}>ROUTE=/new-map · OWNER=feature-state · WORLDCOPIES=ON</div>
        </div>
      </div>
      <div ref={containerRef} className={styles.mapSurface} data-testid="new-map-surface" />
      {error ? (
        <div className={styles.errorBox} data-testid="new-map-error">
          {error}
        </div>
      ) : null}
    </section>
  );
}
