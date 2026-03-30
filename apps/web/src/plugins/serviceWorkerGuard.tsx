"use client";

import { useEffect } from "react";

export default function ServiceWorkerGuard() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((reg) => reg.unregister())))
      .catch(() => {
        // best effort only
      });
  }, []);

  return null;
}

