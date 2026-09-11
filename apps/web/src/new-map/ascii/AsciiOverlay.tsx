"use client";

import { useEffect, useRef } from "react";
import styles from "../MapRoot.module.css";
import { AsciiEngine } from "./ascii-engine";
import { ASCII_SCENARIOS } from "./ascii-scenarios/registry";
import { getGeoContext } from "./geo-store";

const LOCAL_ASCII_START_DELAY_MS = 5_000;
const PRODUCTION_ASCII_START_DELAY_MS = 60_000;

function asciiStartDelay() {
  const host = window.location.hostname;
  const isLocalHost = host === "127.0.0.1" || host === "localhost" || host === "::1" || host.endsWith(".local");
  return process.env.NODE_ENV === "production" && !isLocalHost
    ? PRODUCTION_ASCII_START_DELAY_MS
    : LOCAL_ASCII_START_DELAY_MS;
}

type AsciiOverlayProps = {
  surfaceTestId?: string;
};

export default function AsciiOverlay({ surfaceTestId = "new-map-surface" }: AsciiOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new AsciiEngine(canvas, ASCII_SCENARIOS, getGeoContext);
    canvas.dataset.asciiState = "waiting";
    let startTimer = 0;
    let readyPoll = 0;

    const scheduleStart = () => {
      if (startTimer || engine.running) return;
      canvas.dataset.asciiState = "scheduled";
      startTimer = window.setTimeout(() => {
        startTimer = 0;
        if (engine.running) return;
        engine.start();
        engine.trigger("auto");
        canvas.dataset.asciiState = "running";
      }, asciiStartDelay());
    };

    const pollUntilReady = () => {
      const surface = document.querySelector(`[data-testid="${surfaceTestId}"]`);
      if (surface?.getAttribute("data-map-ready") === "1") {
        window.clearInterval(readyPoll);
        readyPoll = 0;
        scheduleStart();
      }
    };

    pollUntilReady();
    if (!startTimer) {
      readyPoll = window.setInterval(pollUntilReady, 500);
    }

    return () => {
      if (readyPoll) window.clearInterval(readyPoll);
      window.clearTimeout(startTimer);
      engine.stop();
      canvas.dataset.asciiState = "stopped";
    };
  }, [surfaceTestId]);

  return <canvas ref={canvasRef} className={styles.asciiCanvas} data-testid="antarctic-ascii-overlay" aria-hidden="true" />;
}
