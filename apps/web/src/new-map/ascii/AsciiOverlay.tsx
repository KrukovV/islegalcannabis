"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "../MapRoot.module.css";
import { getGeoContext, subscribeGeoContext, type GeoContext } from "./geo-store";
import SvgAntarcticaStage from "./SvgAntarcticaStage";
import { nextSvgStoryIndex, SVG_STORIES } from "./svg-scenarios";

const LOCAL_ASCII_START_DELAY_MS = 5_000;
const PRODUCTION_ASCII_START_DELAY_MS = 60_000;
const FALLBACK_VIEWPORT = { width: 1280, height: 720 } as const;
const STAGE_HALF_WIDTH = 282;
const STAGE_TOP = 228;
const STAGE_BOTTOM = 48;

function asciiStartDelay() {
  const host = window.location.hostname;
  const isLocalHost = host === "127.0.0.1" || host === "localhost" || host === "::1" || host.endsWith(".local");
  return process.env.NODE_ENV === "production" && !isLocalHost
    ? PRODUCTION_ASCII_START_DELAY_MS
    : LOCAL_ASCII_START_DELAY_MS;
}

export function resolveSvgAnchor(geo: GeoContext, viewport: { width: number; height: number }) {
  const scaleX = geo.viewportWidth ? viewport.width / geo.viewportWidth : 1;
  const scaleY = geo.viewportHeight ? viewport.height / geo.viewportHeight : 1;
  const hasProjectedAnchor = Number.isFinite(geo.anchorX) && Number.isFinite(geo.anchorY);
  const projectedX = hasProjectedAnchor ? Number(geo.anchorX) * scaleX : viewport.width * 0.5;
  const projectedY = hasProjectedAnchor ? Number(geo.anchorY) * scaleY - 20 : viewport.height * 0.82;
  const stageScale = Math.max(0.62, Math.min(1.08, viewport.width / 980));
  const bounds = {
    left: projectedX - STAGE_HALF_WIDTH * stageScale,
    right: projectedX + STAGE_HALF_WIDTH * stageScale,
    top: projectedY - STAGE_TOP * stageScale,
    bottom: projectedY + STAGE_BOTTOM * stageScale
  };
  const visible = hasProjectedAnchor
    && bounds.right >= 0
    && bounds.left <= viewport.width
    && bounds.bottom >= 0
    && bounds.top <= viewport.height;

  return {
    x: projectedX,
    y: projectedY,
    visible
  };
}

type AsciiOverlayProps = {
  surfaceTestId?: string;
};

type OverlayState = "waiting" | "scheduled" | "running" | "paused" | "reduced-motion" | "offscreen";

export default function AsciiOverlay({ surfaceTestId = "new-map-surface" }: AsciiOverlayProps) {
  const [started, setStarted] = useState(false);
  const [scheduled, setScheduled] = useState(false);
  const [storyIndex, setStoryIndex] = useState(0);
  const [geo, setGeo] = useState<GeoContext>(() => getGeoContext());
  const [viewport, setViewport] = useState<{ width: number; height: number }>(FALLBACK_VIEWPORT);
  const [documentVisible, setDocumentVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => subscribeGeoContext(setGeo), []);

  useEffect(() => {
    const syncViewport = () => {
      setViewport({
        width: Math.max(1, window.innerWidth),
        height: Math.max(1, window.innerHeight)
      });
    };
    syncViewport();
    window.addEventListener("resize", syncViewport, { passive: true });
    window.visualViewport?.addEventListener("resize", syncViewport, { passive: true });
    return () => {
      window.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("resize", syncViewport);
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotionPreference = () => setReducedMotion(media.matches);
    const syncVisibility = () => setDocumentVisible(document.visibilityState === "visible");
    syncMotionPreference();
    syncVisibility();
    media.addEventListener("change", syncMotionPreference);
    document.addEventListener("visibilitychange", syncVisibility);
    return () => {
      media.removeEventListener("change", syncMotionPreference);
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, []);

  useEffect(() => {
    if (started) return;

    let readyPoll = 0;
    let startTimer = 0;

    const scheduleStart = () => {
      if (startTimer || started) return;
      setScheduled(true);
      startTimer = window.setTimeout(() => {
        startTimer = 0;
        setScheduled(false);
        setStarted(true);
      }, asciiStartDelay());
    };

    const pollUntilReady = () => {
      const surface = document.querySelector(`[data-testid="${surfaceTestId}"]`);
      if (surface?.getAttribute("data-map-ready") !== "1") return;
      if (readyPoll) window.clearInterval(readyPoll);
      readyPoll = 0;
      scheduleStart();
    };

    pollUntilReady();
    if (!startTimer) readyPoll = window.setInterval(pollUntilReady, 500);

    return () => {
      if (readyPoll) window.clearInterval(readyPoll);
      if (startTimer) window.clearTimeout(startTimer);
    };
  }, [started, surfaceTestId]);

  const story = SVG_STORIES[storyIndex];
  const anchor = useMemo(() => resolveSvgAnchor(geo, viewport), [geo, viewport]);
  const motionEnabled = started && documentVisible && !reducedMotion && anchor.visible;

  useEffect(() => {
    if (!motionEnabled) return;
    const storyTimer = window.setTimeout(() => {
      setStoryIndex((current) => nextSvgStoryIndex(current));
    }, story.durationMs);
    return () => window.clearTimeout(storyTimer);
  }, [motionEnabled, story.durationMs, story.id]);

  const overlayState: OverlayState = !started
    ? scheduled ? "scheduled" : "waiting"
    : !anchor.visible
      ? "offscreen"
      : reducedMotion
      ? "reduced-motion"
      : documentVisible ? "running" : "paused";

  return (
    <SvgAntarcticaStage
      story={story}
      width={viewport.width}
      height={viewport.height}
      anchorX={anchor.x}
      anchorY={anchor.y}
      visible={anchor.visible}
      motionEnabled={motionEnabled}
      className={styles.asciiCanvas}
      testId="antarctic-ascii-overlay"
      overlayState={overlayState}
      storyCount={SVG_STORIES.length}
    />
  );
}
