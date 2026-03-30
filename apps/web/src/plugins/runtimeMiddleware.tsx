"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FeatureFlag, summarizeFeatureFlags, type FeatureFlagMap } from "@/config/featureFlags";
import { resolveColorMode } from "@/config/theme";
import { useSSOTData } from "@/composables/useSSOTData";
import { initAnalytics, trackEvent } from "@/plugins/analytics";
import { runMiddleware } from "@/middleware/orchestrator";

type RuntimeWindow = Window & { __runtimeFlags?: FeatureFlagMap };

export default function RuntimeMiddleware() {
  const router = useRouter();
  const pathname = usePathname();
  useSSOTData();

  useEffect(() => {
    const mode = resolveColorMode();
    const resolvedMode =
      mode === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : mode;
    const query = Object.fromEntries(new URLSearchParams(window.location.search).entries());
    const storage = {
      premium: window.localStorage.getItem("premium"),
      trip_mode: window.localStorage.getItem("trip_mode"),
      near_legal: window.localStorage.getItem("near_legal"),
      map_enabled: window.localStorage.getItem("map_enabled"),
      world_overlay: window.localStorage.getItem("world_overlay"),
      us_states_overlay: window.localStorage.getItem("us_states_overlay")
    };
    void runMiddleware({ query, storage }).then((result) => {
      (window as RuntimeWindow).__runtimeFlags = result.flags;
      const summary = summarizeFeatureFlags(result.flags);
      document.body.dataset.premiumEnabled = result.flags[FeatureFlag.PREMIUM].enabled ? "1" : "0";
      document.body.dataset.tripModeEnabled = result.gates.canTripMode ? "1" : "0";
      document.body.dataset.flagsSummary = Object.entries(summary)
        .map(([key, value]) => `${key}:${value}`)
        .join(",");
      document.documentElement.dataset.colorMode = resolvedMode;
    });
  }, []);

  useEffect(() => {
    const prefetched = new Set<string>();
    const patterns = [
      /^\/check(?:\?|$)/,
      /^\/wiki-truth(?:\?|$)/,
      /^\/is-cannabis-legal-in-/,
      /^\/is-cbd-legal-in-/,
      /^\/are-vapes-legal-in-/,
      /^\/are-concentrates-legal-in-/,
      /^\/are-edibles-legal-in-/
    ];

    const maybePrefetch = (target: EventTarget | null) => {
      if (!(target instanceof Element)) {
        return;
      }
      const anchor = target.closest("a[href]");
      if (!anchor) {
        return;
      }
      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("/")) {
        return;
      }
      if (!patterns.some((re) => re.test(href))) {
        return;
      }
      if (prefetched.has(href)) {
        return;
      }
      prefetched.add(href);
      router.prefetch(href);
    };

    const onHover = (event: Event) => maybePrefetch(event.target);
    const onFocus = (event: Event) => maybePrefetch(event.target);

    document.addEventListener("mouseover", onHover, { passive: true });
    document.addEventListener("focusin", onFocus);

    return () => {
      document.removeEventListener("mouseover", onHover);
      document.removeEventListener("focusin", onFocus);
    };
  }, [router]);

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    if (!pathname) return;
    void trackEvent("page_view", { path: pathname });
  }, [pathname]);

  return null;
}
