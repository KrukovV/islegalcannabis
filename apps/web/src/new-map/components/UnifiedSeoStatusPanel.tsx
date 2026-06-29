"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CountryPageData } from "@/lib/countryPageStorage";
import { deriveCountryCardEntryFromCountryPageData } from "@/lib/countryCardEntry";
import { getCannabisProfileCardSections } from "@/lib/cannabisProfile";
import { buildCountryIntentSections } from "@/lib/seo/countryIntentContent";
import type { SeoLocale } from "@/lib/seo/i18n";
import { getSeoText } from "@/lib/seo/i18n";
import { localizePanel, localizePanelFromEntry } from "@/lib/seo/panelLocale";
import { getLinkScope, isSameLink } from "@/lib/linkDisplayPolicy";
import type { CountryCardEntry } from "../map.types";
import styles from "../MapRoot.module.css";

export default function UnifiedSeoStatusPanel({
  data,
  entry,
  locale,
  onClose
}: {
  data?: CountryPageData | null;
  entry?: CountryCardEntry | null;
  locale: SeoLocale;
  onClose: () => void;
}) {
  const currentPath = usePathname() || "/";
  const card = entry || (data ? deriveCountryCardEntryFromCountryPageData(data) : null);
  if (!card) return null;
  const intents = data ? buildCountryIntentSections(data, { locale }) : [];
  const seo = getSeoText(locale);
  const localizedPanel = data ? localizePanel(card, data, locale) : localizePanelFromEntry(card, locale);
  const panelTitle = "title" in localizedPanel && typeof localizedPanel.title === "string" && localizedPanel.title
    ? localizedPanel.title
    : localizedPanel.labels.titleIn(localizedPanel.levelTitle, card.displayName.split(" / ")[0] || card.displayName);
  const panel = {
    ...localizedPanel,
    title: panelTitle
  };
  const cannabisProfileSections = getCannabisProfileCardSections(card.cannabisProfile);
  const lawSnapshotParagraphs = data
    ? [panel.summary, seo.intro(data)]
    : Array.from(new Set([panel.summary, card.normalizedStatusSummary, card.notes].map((item) => String(item || "").trim()).filter(Boolean)));
  const reasonLinkClass = (href: string) =>
    getLinkScope(href) === "project" ? styles.viewportPopupReasonLink : styles.viewportPopupSourceInlineLink;
  const isSelfLink = (href: string) => isSameLink(href, currentPath, currentPath);
  const isSameReasonSourceLink = (sourceUrl: string, reasonHref: string) =>
    isSelfLink(sourceUrl) || isSameLink(sourceUrl, reasonHref, currentPath);
  const renderLink = (href: string, label: string) => {
    if (!href) return null;
    const className = reasonLinkClass(href);
    const isProject = getLinkScope(href) === "project";
    const externalProps = isProject
      ? {}
      : {
          target: "_blank" as const,
          rel: "nofollow noopener noreferrer"
        };
    if (isProject && !href.startsWith("#")) {
      return (
        <Link href={href} className={className}>
          {label}
        </Link>
      );
    }
    return (
      <a href={href} className={className} {...externalProps}>
        {label}
      </a>
    );
  };
  const renderReasonSection = (
    reasonItems: Array<{ id: string; text: string; href: string; sourceUrl?: string }>,
    title: string
  ) =>
    reasonItems.length > 0 ? (
      <>
        <h3 className={styles.seoPanelSubheading}>{title}</h3>
        <ul className={styles.seoPanelList}>
          {reasonItems.map((reason) => (
            <li key={reason.id}>
              {!isSelfLink(reason.href) ? (
                renderLink(reason.href, reason.text)
              ) : null}
              {reason.sourceUrl && !isSameReasonSourceLink(reason.sourceUrl, reason.href) ? (
                <>
                  {" "}
                  {renderLink(reason.sourceUrl, "Source")}
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </>
    ) : null;
  const renderSourceLink = (url: string, label: string) => renderLink(url, label);

  return (
    <aside className={styles.seoOverlayPanel} data-testid="new-map-seo-overlay">
      <div className={styles.seoPanelHeader}>
        <div>
          <div className={styles.eyebrow}>{(data?.node_type || card.type) === "state" ? panel.labels.eyebrowState : panel.labels.eyebrowCountry}</div>
          <div className={styles.unifiedPanelStatusRow}>
            <span className={styles.unifiedPanelStatusBadge} data-category={card.mapCategory}>
              {panel.levelTitle}
            </span>
            <h2 className={styles.seoPanelStatusTitle}>{panel.title}</h2>
          </div>
          <p className={styles.seoPanelIntro}>{panel.summary}</p>
        </div>
        <button type="button" className={styles.seoPanelClose} onClick={onClose} aria-label="Close country info">
          ×
        </button>
      </div>

      <section className={styles.seoPanelSection}>
        {renderReasonSection(panel.critical, panel.labels.hardRestrictions)}
        {renderReasonSection(panel.info, panel.labels.moreContext)}
        {renderReasonSection(panel.why, panel.labels.whyThisColor)}
        <h3 className={styles.seoPanelSubheading}>{panel.labels.lawSnapshot}</h3>
        {lawSnapshotParagraphs.map((paragraph, index) => (
          <p key={`${index}-${paragraph}`} className={styles.seoPanelIntro}>
            {paragraph}
          </p>
        ))}
      </section>

      {intents.length > 0 ? (
        <section className={styles.seoPanelSection}>
          <h3 className={styles.seoPanelSubheading}>{panel.labels.intent}</h3>
          {intents.map((intent) => (
            <div key={intent.id} className={styles.unifiedPanelIntentBlock}>
              <p className={styles.unifiedPanelIntentTitle}>{intent.heading}</p>
              <p>{intent.body}</p>
            </div>
          ))}
        </section>
      ) : null}

      {cannabisProfileSections.length > 0 ? (
        <section className={styles.seoPanelSection}>
          <h3 className={styles.seoPanelSubheading}>Cannabis profile</h3>
          {card.cannabisProfile?.sourceUrl && !isSelfLink(card.cannabisProfile.sourceUrl) ? (
            <p className={styles.seoPanelIntro}>
              {renderLink(
                card.cannabisProfile.sourceUrl,
                card.cannabisProfile.sourceTitle || "Wikipedia source"
              )}
            </p>
          ) : null}
          {cannabisProfileSections.map((section) => (
            <div key={section.id} className={styles.unifiedPanelIntentBlock}>
              <p className={styles.unifiedPanelIntentTitle}>{section.heading}</p>
              <ul className={styles.seoPanelList}>
                {section.items.map((item) => (
                  <li key={`${section.id}-${item}`}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      <section className={styles.seoPanelSection}>
        <h3 className={styles.seoPanelSubheading}>{panel.labels.related}</h3>
        <ul className={styles.seoPanelList}>
          {(data?.related_names || []).map((item) => (
            (isSelfLink(`/c/${item.code}`) ? null : (
              <li key={item.code}>
                {renderLink(`/c/${item.code}`, item.name)}
              </li>
            ))
          ))}
        </ul>
      </section>

      {card.sources.length > 0 ? (
        <section className={styles.seoPanelSection}>
          <h3 className={styles.seoPanelSubheading}>{panel.labels.sources}</h3>
          <ul className={styles.seoPanelList}>
            {card.sources.map((source) => (
              <li key={source.id}>
                {isSelfLink(source.url) ? null : renderSourceLink(source.url, source.title)}
              </li>
            ))}
          </ul>
        </section>
      ) : data && data.sources.citations.length > 0 ? (
        <section className={styles.seoPanelSection}>
          <h3 className={styles.seoPanelSubheading}>{panel.labels.sources}</h3>
          <ul className={styles.seoPanelList}>
            {data.sources.citations.map((source) => (
              <li key={source.id}>
                {isSelfLink(source.url) ? null : renderSourceLink(source.url, source.title)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={styles.seoPanelSection}>
        {card.detailsHref && !isSelfLink(card.detailsHref) ? (
          renderSourceLink(card.detailsHref, panel.labels.legalSource)
        ) : (
          <span className={styles.seoPanelMuted}>{panel.labels.noDedicatedSource}</span>
        )}
      </section>
    </aside>
  );
}
