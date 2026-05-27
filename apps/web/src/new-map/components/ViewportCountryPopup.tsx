"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import type { SeoLocale } from "@/lib/seo/i18n";
import { getSeoText } from "@/lib/seo/i18n";
import { localizePanelFromEntry } from "@/lib/seo/panelLocale";
import { formatDistributionDetail, formatMedicalDetail, formatRecreationalDetail } from "../statusPresentation";
import type { CountryCardEntry } from "../map.types";
import styles from "../MapRoot.module.css";
import { readVisualViewportSnapshot, subscribeToVisualViewportChanges } from "../viewportMetrics";

export default function ViewportCountryPopup({
  entry,
  locale,
  anchor,
  onClose,
  onOpenDetails
}: {
  entry: CountryCardEntry;
  locale: SeoLocale;
  anchor: { x: number; y: number } | null;
  onClose: () => void;
  onOpenDetails?: (_entry: CountryCardEntry) => void;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number; placement: "left" | "right" }>({
    left: 16,
    top: 16,
    placement: "right"
  });
  const seo = getSeoText(locale);
  const panel = localizePanelFromEntry(entry, locale);

  useLayoutEffect(() => {
    if (!anchor || !panelRef.current || typeof window === "undefined") return;
    const panel = panelRef.current;
    let frameId = 0;
    const GAP = 18;

    const parseCssPx = (value: string | null, fallback: number) => {
      const parsed = Number.parseFloat(value || "");
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    const updatePosition = () => {
      const rect = panel.getBoundingClientRect();
      const root = document.querySelector('[data-testid="new-map-root"]');
      const rootStyle = root ? window.getComputedStyle(root) : null;
      const viewport = readVisualViewportSnapshot();
      const safeTop = Math.max(12, parseCssPx(rootStyle?.getPropertyValue("--new-map-safe-top") || null, 0));
      const safeLeft = Math.max(12, parseCssPx(rootStyle?.getPropertyValue("--new-map-safe-left") || null, 0));
      const safeRight = Math.max(12, parseCssPx(rootStyle?.getPropertyValue("--new-map-safe-right") || null, 0));
      const safeBottom = Math.max(12, parseCssPx(rootStyle?.getPropertyValue("--new-map-bottom-safe") || null, 172));
      const dockNode = document.querySelector('[data-testid="new-map-ai-dock"]') as HTMLElement | null;
      const dockTop = dockNode?.getBoundingClientRect().top || (viewport.height + viewport.offsetTop - safeBottom);
      const viewportWidth = viewport.width || window.innerWidth;
      const viewportHeight = viewport.height || window.innerHeight;
      const viewportLeft = viewport.offsetLeft || 0;
      const viewportTop = viewport.offsetTop || 0;
      const panelWidth = rect.width || 420;
      const panelHeight = rect.height || 300;
      const preferRight = anchor.x < (viewportLeft + viewportWidth * 0.5);
      const unclampedLeft = preferRight ? anchor.x + GAP : anchor.x - panelWidth - GAP;
      const minLeft = viewportLeft + safeLeft;
      const maxLeft = viewportLeft + viewportWidth - safeRight - panelWidth;
      const left = Math.min(Math.max(minLeft, unclampedLeft), Math.max(minLeft, maxLeft));
      const topLimit = viewportTop + safeTop;
      const bottomLimit = Math.min(viewportTop + viewportHeight - safeBottom, dockTop - 16);
      const unclampedTop = anchor.y - panelHeight * 0.35;
      const top = Math.min(Math.max(topLimit, unclampedTop), Math.max(topLimit, bottomLimit - panelHeight));
      setPosition({
        left,
        top,
        placement: preferRight ? "right" : "left"
      });
    };

    const schedulePosition = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(updatePosition);
    };

    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(schedulePosition) : null;
    resizeObserver?.observe(panel);
    const unsubscribeViewport = subscribeToVisualViewportChanges(schedulePosition);
    schedulePosition();
    return () => {
      resizeObserver?.disconnect();
      unsubscribeViewport();
      window.cancelAnimationFrame(frameId);
    };
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
            {panel.levelTitle}
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

      <p className={styles.viewportPopupSummary}>{panel.summary}</p>
      {renderList(panel?.labels.hardRestrictions || "Hard restrictions", "❗", panel?.critical || entry.panel.critical)}
      {renderList(panel?.labels.moreContext || "More context", "ℹ️", panel?.info || entry.panel.info)}
      {renderList(panel?.labels.whyThisColor || "Why this color", "→", panel?.why || entry.panel.why)}

      <section className={styles.viewportPopupSection}>
        <div className={styles.viewportPopupSectionTitle}>{panel?.labels.lawSnapshot || "Law snapshot"}</div>
        <ul className={styles.viewportPopupList}>
          <li className={styles.viewportPopupPlainItem}>{seo.recreational}: {formatRecreationalDetail(entry)}</li>
          <li className={styles.viewportPopupPlainItem}>{seo.medical}: {formatMedicalDetail(entry)}</li>
          <li className={styles.viewportPopupPlainItem}>{seo.distribution}: {formatDistributionDetail(entry)}</li>
        </ul>
      </section>

      {entry.sources.length > 0 ? (
        <section className={styles.viewportPopupSection}>
          <div className={styles.viewportPopupSectionTitle}>{panel?.labels.sources || "Sources"}</div>
          <ul className={styles.viewportPopupList}>
            {entry.sources.map((source) => (
              <li key={source.id} className={styles.viewportPopupPlainItem}>
                <a className={styles.viewportPopupSourceInlineLink} href={source.url} target="_blank" rel="noreferrer">
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className={styles.viewportPopupFooter}>
        <a
          className={styles.viewportPopupCta}
          href={entry.pageHref}
          onClick={(event) => {
            if (!onOpenDetails) return;
            event.preventDefault();
            onOpenDetails(entry);
          }}
        >
          {panel?.labels.details || "Details →"}
        </a>
      </div>
    </aside>
  );
}
