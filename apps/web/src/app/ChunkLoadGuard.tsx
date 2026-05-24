"use client";

import { useEffect } from "react";

const CHUNK_FAILURE_PATTERNS = [
  /ChunkLoadError/i,
  /Failed to load chunk/i,
  /Loading chunk [\w-]+ failed/i,
  /\/_next\/static\/chunks\//i
];

function hasChunkFailure(value: unknown): boolean {
  if (!value) return false;
  if (typeof value === "string") {
    return CHUNK_FAILURE_PATTERNS.some((pattern) => pattern.test(value));
  }
  if (value instanceof Error) {
    return hasChunkFailure(value.message) || hasChunkFailure(value.stack);
  }
  if (typeof value === "object") {
    const record = value as { message?: unknown; stack?: unknown; src?: unknown; reason?: unknown };
    return (
      hasChunkFailure(record.message) ||
      hasChunkFailure(record.stack) ||
      hasChunkFailure(record.src) ||
      hasChunkFailure(record.reason)
    );
  }
  return false;
}

export default function ChunkLoadGuard() {
  useEffect(() => {
    const reloadKey = `islegal:chunk-reload:${location.pathname}`;

    const reloadOnce = () => {
      try {
        if (sessionStorage.getItem(reloadKey) === "1") return;
        sessionStorage.setItem(reloadKey, "1");
      } catch {
        // Storage may be unavailable in private modes; still prefer one recovery attempt.
      }
      location.reload();
    };

    const onError = (event: ErrorEvent) => {
      const target = event.target as HTMLScriptElement | null;
      if (hasChunkFailure(event.message) || hasChunkFailure(event.error) || hasChunkFailure(target?.src)) {
        reloadOnce();
      }
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (hasChunkFailure(event.reason)) {
        reloadOnce();
      }
    };

    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
