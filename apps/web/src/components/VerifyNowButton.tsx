"use client";

import { useState } from "react";
import styles from "./ResultCard.module.css";

type VerifyNowButtonProps = {
  iso: string;
  disabled?: boolean;
  verifiedAt?: string | null;
  nowIso?: string | null;
};

export default function VerifyNowButton({
  iso,
  disabled = false,
  verifiedAt,
  nowIso
}: VerifyNowButtonProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const nowMs = nowIso ? new Date(nowIso).getTime() : 0;
  const verifiedAtDate = verifiedAt ? new Date(verifiedAt) : null;
  const hasFresh =
    nowMs > 0 &&
    verifiedAtDate !== null &&
    !Number.isNaN(verifiedAtDate.getTime()) &&
    nowMs - verifiedAtDate.getTime() < 7 * 24 * 60 * 60 * 1000;

  const handleClick = async () => {
    if (disabled || hasFresh || status === "loading") return;
    setStatus("loading");
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ iso })
      });
      setStatus(res.ok ? "done" : "error");
      setTimeout(() => {
        if (typeof window !== "undefined") window.location.reload();
      }, 800);
    } catch {
      setStatus("error");
    }
  };

  const label = status === "loading" ? "Verifying..." : "Verify now";

  return (
    <div>
      <button
        type="button"
        className={styles.sourceButton}
        onClick={handleClick}
        disabled={disabled || hasFresh || status === "loading"}
        data-testid="verify-now"
      >
        {label}
      </button>
      {disabled || hasFresh ? (
        <div className={styles.updated} data-testid="verify-now-disabled">
          Recently verified.
        </div>
      ) : null}
    </div>
  );
}
