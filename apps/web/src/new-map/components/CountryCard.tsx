"use client";

import styles from "../MapRoot.module.css";
import type { CountryCardEntry } from "../map.types";
import { formatDistributionDetail, formatFlags, formatMedicalDetail, formatRecreationalDetail } from "../statusPresentation";

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
      <div className={styles.countryCardMeta}>{entry.normalizedStatusSummary}</div>
      <div className={styles.countryCardMeta}>Recreational: {formatRecreationalDetail(entry)}</div>
      <div className={styles.countryCardMeta}>Medical: {formatMedicalDetail(entry)}</div>
      <div className={styles.countryCardMeta}>Distribution: {formatDistributionDetail(entry)}</div>
      {entry.mapReason ? <div className={styles.countryCardMeta}>{entry.mapReason}</div> : null}
      {entry.distributionFlags.length > 0 ? (
        <div className={styles.countryCardMeta}>Distribution flags: {formatFlags(entry.distributionFlags)}</div>
      ) : null}
      {entry.statusFlags.length > 0 ? (
        <div className={styles.countryCardMeta}>Flags: {formatFlags(entry.statusFlags)}</div>
      ) : null}
      <div className={styles.countryCardNotes}>
        {entry.notes || "No notes available."}
      </div>
    </div>
  );
}
