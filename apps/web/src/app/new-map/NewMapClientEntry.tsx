"use client";

import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import type { RuntimeIdentity } from "@/lib/runtimeIdentity";
import type { CountryPageData } from "@/lib/countryPageStorage";
import type { SeoLocale } from "@/lib/seo/i18n";
import { hasFirstVisualReady, onFirstVisualReady } from "@/new-map/startupTrace";

type Props = {
  countriesUrl: string;
  visibleStamp: string;
  runtimeIdentity: RuntimeIdentity;
  initialGeoCode?: string | null;
  seoCountryData?: CountryPageData | null;
  seoCountryIndex?: Record<string, CountryPageData>;
  locale?: SeoLocale;
};

type MapRootComponent = ComponentType<Props>;
const NEW_MAP_RUNTIME_DELAY_MS = 1200;

export default function NewMapClientEntry(props: Props) {
  const runtimeKey = [
    props.runtimeIdentity.buildId,
    props.runtimeIdentity.commit,
    props.runtimeIdentity.builtAt,
    props.runtimeIdentity.datasetHash,
    props.runtimeIdentity.finalSnapshotId,
    props.runtimeIdentity.snapshotBuiltAt
  ].join("|");
  const [bootMapRuntime, setBootMapRuntime] = useState(hasFirstVisualReady());
  const [MapRoot, setMapRoot] = useState<MapRootComponent | null>(null);

  useEffect(() => {
    if (bootMapRuntime || hasFirstVisualReady()) {
      setBootMapRuntime(true);
      return;
    }
    let cancelled = false;
    const activate = () => {
      if (cancelled) return;
      setBootMapRuntime(true);
    };
    const timer = window.setTimeout(activate, NEW_MAP_RUNTIME_DELAY_MS);
    const unsubscribe = onFirstVisualReady(activate);
    const opts = { once: true, passive: true } as const;
    const eventOpts = [
      ["pointerdown", activate],
      ["touchstart", activate],
      ["wheel", activate],
      ["keydown", activate],
      ["scroll", activate]
    ] as const;
    for (const [type, listener] of eventOpts) {
      window.addEventListener(type, listener, opts);
    }
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      for (const [type, listener] of eventOpts) {
        window.removeEventListener(type, listener);
      }
      unsubscribe();
    };
  }, [bootMapRuntime]);

  useEffect(() => {
    if (!bootMapRuntime) {
      setMapRoot(null);
      return;
    }
    let cancelled = false;
    setMapRoot(null);
    void import("@/new-map/MapRoot")
      .then((module) => {
        if (cancelled) return;
        setMapRoot(() => module.default as MapRootComponent);
      })
      .catch(() => {
        if (!cancelled) {
          setMapRoot(() => null);
        }
      });
    return () => {
      cancelled = true;
      setMapRoot(null);
    };
  }, [bootMapRuntime, runtimeKey]);

  if (!bootMapRuntime) {
    return null;
  }

  if (!MapRoot) {
    return null;
  }

  return <MapRoot key={runtimeKey} {...props} />;
}
