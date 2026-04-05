"use client";

import dynamic from "next/dynamic";

const ServiceWorkerGuard = dynamic(() => import("@/plugins/serviceWorkerGuard"), { ssr: false });
const NewMapDeferredRuntime = dynamic(() => import("./NewMapDeferredRuntime"), { ssr: false });

export default function LayoutRuntimeShell() {
  return (
    <>
      <ServiceWorkerGuard />
      <NewMapDeferredRuntime />
    </>
  );
}
