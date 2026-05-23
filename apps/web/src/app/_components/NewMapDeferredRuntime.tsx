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
    return onFirstVisualReady(() => {
      setReady(true);
    });
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
