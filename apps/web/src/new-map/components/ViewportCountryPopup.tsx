"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import type { SeoLocale } from "@/lib/seo/i18n";
import { getSeoText } from "@/lib/seo/i18n";
import { localizePanelFromEntry } from "@/lib/seo/panelLocale";
import { formatDistributionDetail, formatMedicalDetail, formatRecreationalDetail } from "../statusPresentation";
import type { CountryCardEntry } from "../map.types";
import { readVisualViewportSnapshot, subscribeToVisualViewportChanges } from "../viewportMetrics";
import styles from "../MapRoot.module.css";

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
    const panelNode = panelRef.current;
    const rootNode = document.querySelector('[data-testid="new-map-root"]') as HTMLElement | null;
    let frameId = 0;
    let settleTimeout = 0;

    const readRootLength = (name: string, fallback: number) => {
      const scope = rootNode || document.documentElement;
      const raw = window.getComputedStyle(scope).getPropertyValue(name);
      const parsed = Number.parseFloat(raw);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    const applyPosition = () => {
      const rect = panelNode.getBoundingClientRect();
      const GAP = 18;
      const viewport = readVisualViewportSnapshot();
      const safeTop = readRootLength("--new-map-panel-top-margin", 20);
      const safeBottom = readRootLength("--new-map-bottom-safe", 172);
      const safeSide = Math.max(
        16,
        readRootLength("--new-map-safe-left", 0) + 12,
        readRootLength("--new-map-safe-right", 0) + 12
      );
      const viewportWidth = viewport.width || window.innerWidth;
      const viewportHeight = viewport.height || window.innerHeight;
      const viewportLeft = viewport.offsetLeft || 0;
      const viewportTop = viewport.offsetTop || 0;
      const dockNode = document.querySelector('[data-testid="new-map-ai-dock"]') as HTMLElement | null;
      const dockTop = dockNode?.getBoundingClientRect().top;
      const viewportBottom = viewportTop + viewportHeight;
      const bottomLimit = Number.isFinite(dockTop)
        ? Math.min(viewportBottom - safeBottom, (dockTop as number) - 12)
        : viewportBottom - safeBottom;
      const panelWidth = rect.width || 420;
      const panelHeight = rect.height || 300;
      const maxLeft = viewportLeft + viewportWidth - safeSide - panelWidth;
      const availableHeight = Math.max(120, bottomLimit - viewportTop - safeTop);
      const maxTop = bottomLimit - Math.min(panelHeight, availableHeight);
      const preferRight = anchor.x < viewportLeft + viewportWidth * 0.5;
      const unclampedLeft = preferRight ? anchor.x + GAP : anchor.x - panelWidth - GAP;
      const left = Math.min(
        Math.max(viewportLeft + safeSide, unclampedLeft),
        Math.max(viewportLeft + safeSide, maxLeft)
      );
      const unclampedTop = anchor.y - panelHeight * 0.35;
      const top =
        panelHeight >= availableHeight
          ? viewportTop + safeTop
          : Math.min(Math.max(viewportTop + safeTop, unclampedTop), Math.max(viewportTop + safeTop, maxTop));
      setPosition({
        left,
        top,
        placement: preferRight ? "right" : "left"
      });
    };

    const schedulePosition = () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(settleTimeout);
      frameId = window.requestAnimationFrame(() => {
        applyPosition();
        frameId = window.requestAnimationFrame(applyPosition);
      });
      // VisualViewport and CSS custom properties can settle one tick later on rotate.
      settleTimeout = window.setTimeout(applyPosition, 120);
    };

    schedulePosition();
    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(schedulePosition) : null;
    resizeObserver?.observe(panelNode);
    const unsubscribeViewport = subscribeToVisualViewportChanges(schedulePosition);

    return () => {
      resizeObserver?.disconnect();
      unsubscribeViewport();
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(settleTimeout);
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
                  className={styles.viewportPopupSourceInlineLink}
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
                <a className={styles.viewportPopupSourceLink} href={source.url} target="_blank" rel="noreferrer">
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
