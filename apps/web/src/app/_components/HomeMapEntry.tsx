"use client";

import type { ComponentProps } from "react";
import dynamic from "next/dynamic";
import { isLocalAuditHost } from "@/lib/privateAuditHost";
import { readHomeMapParams } from "@/lib/homeMapParams";
import { useBrowserUrl } from "@/lib/useBrowserUrl";
import TruthMapRoot from "@/truth-map/TruthMapRoot";

const LocalPublicMapRoot = dynamic(() => import("./LocalPublicMapRoot"), { ssr: false });
type Props = Pick<ComponentProps<typeof TruthMapRoot>, "countriesUrl" | "usStatesUrl" | "visibleStamp" | "runtimeIdentity">;

export default function HomeMapEntry(props: Props) {
  const href = useBrowserUrl();
  // Hydration uses the same empty map shell as prerendering. Mount one map
  // only after the real browser URL supplies its host and bounded camera.
  if (!href) return null;
  const url = new URL(href);
  const mapProps = { ...props, ...readHomeMapParams(url) };
  return isLocalAuditHost(url.hostname)
    ? <LocalPublicMapRoot {...mapProps} />
    : <TruthMapRoot {...mapProps} presentation="public" showPublicMapNotice={false} />;
}
