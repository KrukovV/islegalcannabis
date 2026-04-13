"use client";

import Link from "next/link";
import { formatDistributionDetail, formatMedicalDetail, formatRecreationalDetail } from "../statusPresentation";
import type { CountryCardEntry } from "../map.types";
import styles from "../MapRoot.module.css";

export default function ViewportCountryPopup({
  entry,
  onClose
}: {
  entry: CountryCardEntry;
  onClose: () => void;
}) {
  const renderList = (
    title: string,
    icon: string,
    items: Array<{ id: string; text: string; href: string; sourceUrl?: string }>
  ) => {
    if (!items.length) return null;
    return (
      <section className={styles.viewportPopupSection}>
        <div className={styles.viewportPopupSectionTitle}>
          {icon} {title}
        </div>
        <ul className={styles.viewportPopupList}>
          {items.map((item) => (
            <li key={item.id} className={styles.viewportPopupListItem}>
              <Link href={item.href} className={styles.viewportPopupReasonLink}>
                <strong>{item.text}</strong>
              </Link>
              {item.sourceUrl && item.sourceUrl !== item.href ? (
                <a
                  className={styles.viewportPopupSourceLink}
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Source
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    );
  };

  return (
    <aside className={styles.viewportPopupPanel} data-testid="new-map-country-popup">
      <div className={styles.viewportPopupHeader}>
        <div>
          <div className={styles.viewportPopupTitle}>{entry.displayName}</div>
          <div className={styles.viewportPopupMeta}>ISO2: {entry.iso2 || "Unknown"}</div>
        </div>
        <div className={styles.viewportPopupHeaderControls}>
          <div className={styles.viewportPopupBadge} data-category={entry.mapCategory}>
            {entry.panel.levelTitle}
          </div>
          <button
            type="button"
            className={styles.viewportPopupClose}
            onClick={onClose}
            aria-label={`Close ${entry.displayName} panel`}
          >
            ×
          </button>
        </div>
      </div>

      <p className={styles.viewportPopupSummary}>{entry.panel.summary}</p>
      {renderList("Hard restrictions", "❗", entry.panel.critical)}
      {renderList("More context", "ℹ️", entry.panel.info)}
      {renderList("Why this color", "→", entry.panel.why)}

      <section className={styles.viewportPopupSection}>
        <div className={styles.viewportPopupSectionTitle}>Law snapshot</div>
        <ul className={styles.viewportPopupList}>
          <li className={styles.viewportPopupPlainItem}>Recreational: {formatRecreationalDetail(entry)}</li>
          <li className={styles.viewportPopupPlainItem}>Medical: {formatMedicalDetail(entry)}</li>
          <li className={styles.viewportPopupPlainItem}>Distribution: {formatDistributionDetail(entry)}</li>
        </ul>
      </section>

      {entry.sources.length > 0 ? (
        <section className={styles.viewportPopupSection}>
          <div className={styles.viewportPopupSectionTitle}>Sources</div>
          <ul className={styles.viewportPopupList}>
            {entry.sources.map((source) => (
              <li key={source.id} className={styles.viewportPopupPlainItem}>
                <a className={styles.viewportPopupSourceLink} href={source.url} target="_blank" rel="noreferrer">
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className={styles.viewportPopupFooter}>
        <Link className={styles.viewportPopupCta} href={entry.pageHref}>
          Details →
        </Link>
      </div>
    </aside>
  );
}
