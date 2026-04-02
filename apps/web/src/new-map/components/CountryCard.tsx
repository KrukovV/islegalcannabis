"use client";

import styles from "../MapRoot.module.css";

export type CountryCardEntry = {
  geo: string;
  displayName: string;
  iso2: string | null;
  type: "country" | "state";
  legalStatus: string;
  medicalStatus: string;
  notes: string;
  coordinates?: { lat: number; lng: number };
};

type Props = {
  geo: string | null;
  cardIndex: Record<string, CountryCardEntry>;
};

export default function CountryCard({ geo, cardIndex }: Props) {
  if (!geo) return null;
  const entry = cardIndex[geo];
  if (!entry) return null;

  return (
    <div className={styles.countryCard} data-testid="new-map-country-card">
      <div className={styles.countryCardTitle}>{entry.displayName}</div>
      <div className={styles.countryCardMeta}>ISO2: {entry.iso2 || "Unknown"}</div>
      <div className={styles.countryCardMeta}>Rec: {entry.legalStatus}</div>
      <div className={styles.countryCardMeta}>Med: {entry.medicalStatus}</div>
      <div className={styles.countryCardNotes}>
        {entry.notes || "No notes available."}
      </div>
    </div>
  );
}
