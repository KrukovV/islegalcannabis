"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CountryPageData } from "@/lib/countryPageStorage";
import { deriveCountryCardEntryFromCountryPageData } from "@/lib/countryCardEntry";
import { buildCountryIntentSections } from "@/lib/seo/countryIntentContent";
import type { SeoLocale } from "@/lib/seo/i18n";
import { getSeoText } from "@/lib/seo/i18n";
import { localizePanel } from "@/lib/seo/panelLocale";
import { getLinkScope, isSameLink } from "@/lib/linkDisplayPolicy";
import styles from "../MapRoot.module.css";

export default function UnifiedSeoStatusPanel({
  data,
  locale,
  onClose
}: {
  data: CountryPageData;
  locale: SeoLocale;
  onClose: () => void;
}) {
  const card = deriveCountryCardEntryFromCountryPageData(data);
  const intents = buildCountryIntentSections(data, { locale });
  const seo = getSeoText(locale);
  const panel = localizePanel(card, data, locale);
  const currentPath = usePathname() || "/";
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
          <div className={styles.eyebrow}>{data.node_type === "state" ? panel.labels.eyebrowState : panel.labels.eyebrowCountry}</div>
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
        <p className={styles.seoPanelIntro}>{panel.summary}</p>
        <p className={styles.seoPanelIntro}>{seo.intro(data)}</p>
      </section>

      <section className={styles.seoPanelSection}>
        <h3 className={styles.seoPanelSubheading}>{panel.labels.intent}</h3>
        {intents.map((intent) => (
          <div key={intent.id} className={styles.unifiedPanelIntentBlock}>
            <p className={styles.unifiedPanelIntentTitle}>{intent.heading}</p>
            <p>{intent.body}</p>
          </div>
        ))}
      </section>

      <section className={styles.seoPanelSection}>
        <h3 className={styles.seoPanelSubheading}>{panel.labels.related}</h3>
        <ul className={styles.seoPanelList}>
          {data.related_names.map((item) => (
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
      ) : data.sources.citations.length > 0 ? (
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
