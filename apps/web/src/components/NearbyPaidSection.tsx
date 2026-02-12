"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ResultCard.module.css";

type NearbyItem = {
  id: string;
  status: string;
  summary: string;
  name?: string;
  flag?: string;
};

function flagFromId(id: string) {
  if (!id) return "🏳️";
  const code = id.toUpperCase().replace(/[^A-Z]/g, "");
  if (code.length !== 2) return "🏳️";
  const base = 0x1f1e6;
  const chars = Array.from(code).map((ch) =>
    String.fromCodePoint(base + ch.charCodeAt(0) - 65)
  );
  return chars.join("");
}

function nearbyStatusLabel(status: string) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "green") return "Legal";
  if (normalized === "yellow") return "Decriminalized";
  if (normalized === "orange") return "Unenforced";
  if (normalized === "blue") return "Medical";
  return "Illegal";
}

function readLocalPremium() {
  if (typeof window === "undefined") return false;
  const value = window.localStorage.getItem("premium");
  return value === "1" || value === "true";
}

export default function NearbyPaidSection({
  nearby,
  isPaidUser
}: {
  nearby: NearbyItem[];
  isPaidUser: boolean;
}) {
  const [premium] = useState(() => isPaidUser || readLocalPremium());
  const loggedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const localPremium = readLocalPremium();
    if (!localPremium && !isPaidUser && !loggedRef.current) {
      loggedRef.current = true;
      console.warn("NEARBY_PAID_LOCK=1");
    }
  }, [isPaidUser]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!premium || loggedRef.current) return;
    loggedRef.current = true;
    console.warn("NEARBY_SOURCE=CACHE_ONLY");
    console.warn("NEARBY_OK=1");
  }, [premium]);

  if (!Array.isArray(nearby) || nearby.length === 0) return null;

  if (!premium) {
    return (
      <section className={styles.section} data-testid="nearby-paywall">
        <h2>Nearest places where allowed</h2>
        <p className={styles.warningDisclaimer}>
          Upgrade to unlock nearby legal locations.
        </p>
      </section>
    );
  }

  return (
    <section className={styles.section} data-testid="nearby">
      <h2>Nearest places where allowed</h2>
      <ul className={styles.nearbyList}>
        {nearby.slice(0, 5).map((item) => (
          <li key={item.id} className={styles.nearbyItem}>
            <span className={styles.nearbyId}>
              <span className={styles.flag}>{item.flag ?? flagFromId(item.id)}</span>
              {item.name ? `${item.name} (${item.id})` : item.id}
            </span>
            <span className={styles.nearbyStatus}>
              Status: {nearbyStatusLabel(item.status)}
            </span>
            <span className={styles.nearbySummary}>{item.summary}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
