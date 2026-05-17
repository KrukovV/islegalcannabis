"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import BuildWatcher from "@/plugins/buildWatcher";
import RuntimeMiddleware from "@/plugins/runtimeMiddleware";
import GeoInit from "./GeoInit";
import { hasFirstVisualReady, onFirstVisualReady } from "@/new-map/startupTrace";

export default function NewMapDeferredRuntime() {
  const pathname = usePathname();
  const isNewMapRoute = pathname?.startsWith("/new-map");
  const [ready, setReady] = useState(() => !pathname?.startsWith("/new-map") || hasFirstVisualReady());

  useEffect(() => {
    if (!isNewMapRoute || hasFirstVisualReady()) return;
    let timeoutId = 0;
    let idleId = 0;
    const unsubscribe = onFirstVisualReady(() => {
      if (typeof window === "undefined") {
        setReady(true);
        return;
      }
      const schedule = () => setReady(true);
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(schedule, { timeout: 2500 });
      } else {
        timeoutId = window.setTimeout(schedule, 1200);
      }
    });
    return () => {
      unsubscribe();
      if (idleId && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [isNewMapRoute]);

  if (!ready) return null;

  return (
    <>
      <RuntimeMiddleware />
      <BuildWatcher />
      <GeoInit />
    </>
  );
}
