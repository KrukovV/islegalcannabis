"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { hasFirstVisualReady, onFirstVisualReady } from "@/new-map/startupTrace";

const RuntimeMiddleware = dynamic(() => import("@/plugins/runtimeMiddleware"), { ssr: false });
const GeoInit = dynamic(() => import("./GeoInit"), { ssr: false });
const BuildWatcher =
  process.env.NODE_ENV === "production"
    ? null
    : dynamic(() => import("@/plugins/buildWatcher"), { ssr: false });

const NEW_MAP_RUNTIME_DELAY_MS = 12000;

function isQaMapAuditRoute(pathname: string | null) {
  if (!pathname?.startsWith("/new-map")) return false;
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("qa") === "1";
}

export default function NewMapDeferredRuntime() {
  const pathname = usePathname();
  const isNewMapRoute = pathname?.startsWith("/new-map");
  const qaMapAuditRoute = isQaMapAuditRoute(pathname);
  const [ready, setReady] = useState(() => !pathname?.startsWith("/new-map") || hasFirstVisualReady());
  const [newMapRuntimeReady, setNewMapRuntimeReady] = useState(false);

  useEffect(() => {
    if (qaMapAuditRoute || !isNewMapRoute || hasFirstVisualReady()) return;
    return onFirstVisualReady(() => {
      setReady(true);
    });
  }, [isNewMapRoute, qaMapAuditRoute]);

  useEffect(() => {
    if (qaMapAuditRoute || !ready || !isNewMapRoute || newMapRuntimeReady) return;

    let cancelled = false;
    const activate = () => {
      if (!cancelled) setNewMapRuntimeReady(true);
    };
    const timer = window.setTimeout(activate, NEW_MAP_RUNTIME_DELAY_MS);
    const opts = { once: true, passive: true } as const;
    window.addEventListener("pointerdown", activate, opts);
    window.addEventListener("touchstart", activate, opts);
    window.addEventListener("wheel", activate, opts);
    window.addEventListener("keydown", activate, { once: true });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", activate);
      window.removeEventListener("touchstart", activate);
      window.removeEventListener("wheel", activate);
      window.removeEventListener("keydown", activate);
    };
  }, [isNewMapRoute, newMapRuntimeReady, qaMapAuditRoute, ready]);

  if (qaMapAuditRoute || !ready || (isNewMapRoute && !newMapRuntimeReady)) return null;

  return (
    <>
      <RuntimeMiddleware />
      {BuildWatcher ? <BuildWatcher /> : null}
      <GeoInit />
    </>
  );
}
