"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatDistributionDetail, formatMedicalDetail, formatRecreationalDetail } from "../statusPresentation";
import type { CountryCardEntry } from "../map.types";
import styles from "../MapRoot.module.css";

export default function ViewportCountryPopup({
  entry,
  anchor,
  onClose
}: {
  entry: CountryCardEntry;
  anchor: { x: number; y: number } | null;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number; placement: "left" | "right" }>({
    left: 16,
    top: 16,
    placement: "right"
  });

  useLayoutEffect(() => {
    if (!anchor || !panelRef.current || typeof window === "undefined") return;
    const panel = panelRef.current;
    const rect = panel.getBoundingClientRect();
    const SAFE_TOP = 20;
    const SAFE_BOTTOM = 172;
    const SAFE_SIDE = 16;
    const GAP = 18;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const panelWidth = rect.width || 420;
    const panelHeight = rect.height || 300;
    const preferRight = anchor.x < viewportWidth * 0.5;
    const unclampedLeft = preferRight ? anchor.x + GAP : anchor.x - panelWidth - GAP;
    const left = Math.min(
      Math.max(SAFE_SIDE, unclampedLeft),
      viewportWidth - SAFE_SIDE - panelWidth
    );
    const unclampedTop = anchor.y - panelHeight * 0.35;
    const top = Math.min(
      Math.max(SAFE_TOP, unclampedTop),
      viewportHeight - SAFE_BOTTOM - panelHeight
    );
    setPosition({
      left,
      top,
      placement: preferRight ? "right" : "left"
    });
  }, [anchor, entry.geo]);

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
    <aside
      ref={panelRef}
      className={styles.viewportPopupPanel}
      data-testid="new-map-country-popup"
      data-placement={position.placement}
      style={{
        left: `${position.left}px`,
        top: `${position.top}px`
      }}
    >
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
        {entry.detailsHref ? (
          <a className={styles.viewportPopupCta} href={entry.detailsHref} target="_blank" rel="noreferrer">
            Legal source →
          </a>
        ) : (
          <Link className={styles.viewportPopupCta} href={entry.pageHref}>
            Country page →
          </Link>
        )}
      </div>
    </aside>
  );
}
