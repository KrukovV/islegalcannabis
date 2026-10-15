"use client";

import { useEffect, useRef } from "react";
import styles from "../MapRoot.module.css";
import type { AsciiEngine } from "./ascii-engine";

const ASCII_START_DELAY_MS = process.env.NODE_ENV === "production" ? 60_000 : 5_000;

type AsciiOverlayProps = {
  surfaceTestId?: string;
};

export default function AsciiOverlay({ surfaceTestId = "new-map-surface" }: AsciiOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let engine: AsciiEngine | null = null;
    let disposed = false;
    canvas.dataset.asciiState = "waiting";
    let startTimer = 0;
    let readyPoll = 0;

    const scheduleStart = () => {
      if (startTimer || engine?.running) return;
      // The scene is decorative and starts after the map. Its engine and
      // complete registry need not block the SDK or the first legal layer.
      const runtime = import("./ascii-runtime").then(({ createAsciiEngine }) => {
        if (!disposed) engine = createAsciiEngine(canvas);
      }).catch((error: unknown) => {
        if (disposed) return;
        canvas.dataset.asciiState = "error";
        console.error("ASCII_RUNTIME_LOAD_FAILED", error);
      });
      canvas.dataset.asciiState = "scheduled";
      startTimer = window.setTimeout(() => {
        startTimer = 0;
        void runtime.then(() => {
          if (disposed || !engine || engine.running) return;
          engine.start();
          engine.trigger("auto");
          canvas.dataset.asciiState = "running";
        });
      }, ASCII_START_DELAY_MS);
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
      disposed = true;
      if (readyPoll) window.clearInterval(readyPoll);
      window.clearTimeout(startTimer);
      engine?.stop();
      canvas.dataset.asciiState = "stopped";
    };
  }, [surfaceTestId]);

  return <canvas ref={canvasRef} className={styles.asciiCanvas} data-testid="antarctic-ascii-overlay" aria-hidden="true" />;
}
