"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SeoLocale } from "@/lib/seo/i18n";
import { localizePanelFromEntry } from "@/lib/seo/panelLocale";
import type { CountryCardEntry } from "../map.types";
import styles from "../MapRoot.module.css";
import { sanitizeEvidenceQuoteText } from "@/lib/text/sanitizeEvidenceQuoteText";
import { readVisualViewportSnapshot, subscribeToVisualViewportChanges } from "../viewportMetrics";
import { getLinkScope, isSameLink } from "@/lib/linkDisplayPolicy";

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
  const currentPath = usePathname() || "/";
  const [position, setPosition] = useState<{ left: number; top: number; placement: "left" | "right" }>({
    left: 16,
    top: 16,
    placement: "right"
  });
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
    items: Array<{ id: string; text: string; href: string; sourceUrl?: string }>
  ) => {
    if (!items.length) return null;
    const isSelfLink = (href: string) => isSameLink(href, currentPath, currentPath);
    const isSameReasonSourceLink = (sourceUrl: string, reasonHref: string) =>
      isSelfLink(sourceUrl) || isSameLink(sourceUrl, reasonHref, currentPath);
    const reasonLinkClass = (href: string) =>
      getLinkScope(href) === "project" ? styles.viewportPopupReasonLink : styles.viewportPopupSourceLink;
    const sourceLinkClass = (href: string) =>
      getLinkScope(href) === "project" ? styles.viewportPopupReasonLink : styles.viewportPopupSourceLink;
    const getLinkTarget = (href: string) => {
      if (getLinkScope(href) === "external") {
        return {
          target: "_blank" as const,
          rel: "nofollow noopener noreferrer"
        };
      }
      return {};
    };
    return (
      <section className={styles.viewportPopupSection}>
        <div className={styles.viewportPopupSectionTitle}>{title}</div>
        <ul className={styles.viewportPopupList}>
          {items.map((item) => (
            <li key={item.id} className={styles.viewportPopupListItem}>
              {isSelfLink(item.href) ? null : (
                <Link href={item.href} className={reasonLinkClass(item.href)}>
                  <strong>{item.text}</strong>
                </Link>
              )}
              {item.sourceUrl && !isSameReasonSourceLink(item.sourceUrl, item.href) ? (
                <a className={sourceLinkClass(item.sourceUrl)} href={item.sourceUrl} {...getLinkTarget(item.sourceUrl)}>
                  {sourceDisplayTitle(`Source: ${item.text}`, item.sourceUrl)}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    );
  };

  const getSourceLinkClass = (href: string) =>
    getLinkScope(href) === "project" ? styles.viewportPopupReasonLink : styles.viewportPopupSourceInlineLink;
  const getLinkTarget = (href: string) => {
    if (getLinkScope(href) === "external") {
      return {
        target: "_blank" as const,
        rel: "nofollow noopener noreferrer"
      };
    }
    return {};
  };

  const dedupeByValue = (items: string[]) => {
    const seen = new Set<string>();
    return items.filter((item) => {
      const normalized = item.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
  };

  const resolveSection = (value: string[] | undefined, limit?: number) => {
    const cleaned = (value || []).map((item) => sanitizeEvidenceQuoteText(item)).filter(Boolean);
    return limit ? dedupeByValue(cleaned).slice(0, limit) : dedupeByValue(cleaned);
  };

  const renderProfileSection = (title: string, items: string[] | undefined, limit?: number) => {
    const visible = (items || []).slice(0, limit ?? (items?.length || 0));
    if (!visible.length) return null;
    return (
      <section className={styles.viewportPopupSection}>
        <div className={styles.viewportPopupSectionTitle}>
          {title}
        {entry.cannabisProfile?.sourceUrl && !isSameLink(entry.cannabisProfile.sourceUrl, `/c/${entry.code}`, currentPath) ? (
            <>
              {" · "}
                <a
                  className={getSourceLinkClass(entry.cannabisProfile.sourceUrl)}
                  href={entry.cannabisProfile.sourceUrl}
                  {...getLinkTarget(entry.cannabisProfile.sourceUrl)}
                >
                {sourceDisplayTitle(
                  entry.cannabisProfile.sourceTitle || `Wikipedia: ${entry.displayName}`,
                  entry.cannabisProfile.sourceUrl
                )}
              </a>
            </>
          ) : null}
        </div>
        <ul className={styles.viewportPopupList}>
          {visible.map((item, index) => (
            <li key={`${title}-${index}-${item}`} className={styles.viewportPopupPlainItem}>
              {sanitizeEvidenceQuoteText(item)}
            </li>
          ))}
        </ul>
      </section>
    );
  };

  const jurisdictionLines = resolveSection(
    [
      ...(entry.parentLawSummary ? [entry.parentLawSummary] : []),
      ...(entry.jurisdictionContextNotes || [])
    ],
    3
  );
  const compactLimit = 3;
  const jurisdictionSection = resolveSection(jurisdictionLines, 3);
  const localNamesSectionItems = resolveSection(entry.cannabisProfile?.localNames, 6);
  const productsSectionItems = resolveSection(entry.cannabisProfile?.products, compactLimit);
  const traditionalSectionItems = resolveSection(entry.cannabisProfile?.traditionalUse, compactLimit);
  const cultivationSectionItems = resolveSection(entry.cannabisProfile?.cultivation, compactLimit);
  const marketSectionItems = resolveSection(entry.cannabisProfile?.market, compactLimit);
  const cannabisFoodsSectionItems = resolveSection(entry.cannabisProfile?.cannabisFoods, compactLimit);
  const slangSectionItems = resolveSection(entry.cannabisProfile?.slang, compactLimit);
  const notesSectionItems = resolveSection(entry.cannabisProfile?.notes, compactLimit);
  const enforcementSectionItems = resolveSection(entry.cannabisProfile?.enforcementReality, compactLimit);
  const cultureSectionItems = resolveSection(entry.cannabisProfile?.culture, compactLimit);
  const historySectionItems = resolveSection(entry.cannabisProfile?.history, compactLimit);
  const hasDetailsCta = Boolean(entry.detailsHref || /^\/c\//i.test(entry.pageHref));

  const sourceDisplayTitle = (title: string, href: string) => {
    const sanitized = sanitizeEvidenceQuoteText(title || "").trim();
    if (sanitized) return sanitized;
    if (!href) return "Source";
    try {
      const parsed = new URL(href);
      const normalized = `${parsed.host}${parsed.pathname || ""}`.replace(/\/wiki\//i, "/");
      return normalized || parsed.host || "Source";
    } catch {
      return href;
    }
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
        <div className={styles.viewportPopupHeaderText}>
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

      <section className={styles.viewportPopupSection}>
        <div className={styles.viewportPopupSectionTitle}>Status</div>
        <ul className={styles.viewportPopupList}>
          <li className={styles.viewportPopupPlainItem}>{panel.summary}</li>
        </ul>
      </section>
      {jurisdictionSection.length > 0 ? renderProfileSection("Jurisdiction", jurisdictionSection) : null}
      {renderList(panel?.labels.hardRestrictions || "Hard restrictions", panel?.critical || entry.panel.critical)}
      {renderList(panel?.labels.moreContext || "More context", panel?.info || entry.panel.info)}
      {renderList(panel?.labels.whyThisColor || "Why this color", panel?.why || entry.panel.why)}
      {renderProfileSection("History", historySectionItems)}
      {renderProfileSection("Culture", cultureSectionItems)}
      {renderProfileSection("Enforcement Reality", enforcementSectionItems)}
      {renderProfileSection("Products", productsSectionItems)}
      {renderProfileSection("Traditional Use", traditionalSectionItems)}
      {renderProfileSection("Cannabis Foods", cannabisFoodsSectionItems)}
      {renderProfileSection("Slang", slangSectionItems)}
      {renderProfileSection("Cultivation", cultivationSectionItems)}
      {renderProfileSection("Market", marketSectionItems)}
      {renderProfileSection("Local Names", localNamesSectionItems)}
      {renderProfileSection("Cannabis Profile", notesSectionItems)}

      {entry.sources.length > 0 ? (
        <section className={styles.viewportPopupSection}>
          <div className={styles.viewportPopupSectionTitle}>{panel?.labels.sources || "Sources"}</div>
          <ul className={styles.viewportPopupList}>
            {entry.sources.map((source) => (
              <li key={source.id} className={styles.viewportPopupPlainItem}>
                {isSameLink(source.url, `/c/${entry.code}`, currentPath) ? null : (
                <a
                  className={getSourceLinkClass(source.url)}
                  href={source.url}
                  {...getLinkTarget(source.url)}
                >
                    {sourceDisplayTitle(source.title, source.url)}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {hasDetailsCta ? (
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
      ) : null}
    </aside>
  );
}
