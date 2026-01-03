"use client";

import { useState } from "react";
import styles from "./UpgradePrompt.module.css";

export default function UpgradePrompt() {
  const [sent, setSent] = useState(false);

  async function handleClick() {
    if (sent) return;
    setSent(true);
    try {
      await fetch("/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "upgrade_clicked" })
      });
    } catch {
      setSent(false);
    }
  }

  return (
    <div className={styles.card}>
      <h3>Upgrade to see details</h3>
      <p>
        Unlock full risk details, sources, and upcoming PDF export.
      </p>
      <button className={styles.button} type="button" onClick={handleClick}>
        Upgrade
      </button>
      <p className={styles.note}>Payments not enabled yet.</p>
    </div>
  );
}
