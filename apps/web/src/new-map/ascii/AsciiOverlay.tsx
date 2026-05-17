"use client";

import { useEffect, useRef } from "react";
import styles from "../MapRoot.module.css";
import { AsciiEngine } from "./ascii-engine";
import { ASCII_SCENARIOS } from "./ascii-scenarios/registry";
import { getGeoContext } from "./geo-store";

const ASCII_START_DELAY_MS = process.env.NODE_ENV === "production" ? 60_000 : 5_000;

function shouldAutoStartAscii() {
  if (typeof window === "undefined") return false;
  if (window.navigator.webdriver) return false;
  if (window.matchMedia?.("(pointer: coarse)").matches) return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  return true;
}

export default function AsciiOverlay() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new AsciiEngine(canvas, ASCII_SCENARIOS, getGeoContext);
    const allowAutoStart = shouldAutoStartAscii();
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
      }, ASCII_START_DELAY_MS);
    };

    if (!allowAutoStart) {
      canvas.dataset.asciiState = "disabled";
      return () => {
        engine.stop();
        canvas.dataset.asciiState = "stopped";
      };
    }

    const pollUntilReady = () => {
      const surface = document.querySelector('[data-testid="new-map-surface"]');
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
  }, []);

  return <canvas ref={canvasRef} className={styles.asciiCanvas} aria-hidden="true" />;
}
