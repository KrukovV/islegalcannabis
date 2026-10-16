"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

const browserSnapshot = () => window.location.href;
const serverSnapshot = () => null;

export function useBrowserUrl() {
  return useSyncExternalStore(subscribe, browserSnapshot, serverSnapshot);
}
