"use client";

import Link from "next/link";
import type { CountryPageData } from "@/lib/countryPageStorage";
import { deriveCountryCardEntryFromCountryPageData } from "@/lib/countryCardEntry";
import { buildCountryIntentSections } from "@/lib/seo/countryIntentContent";
import type { SeoLocale } from "@/lib/seo/i18n";
import { getSeoText } from "@/lib/seo/i18n";
import { localizePanel } from "@/lib/seo/panelLocale";
import { formatDistributionDetail, formatMedicalDetail, formatRecreationalDetail } from "../statusPresentation";
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
        {panel.critical.length > 0 ? (
          <>
            <h3 className={styles.seoPanelSubheading}>{panel.labels.hardRestrictions}</h3>
            <ul className={styles.seoPanelList}>
              {panel.critical.map((reason) => (
                <li key={reason.id}>
                  <Link href={reason.href}>{reason.text}</Link>
                  {reason.sourceUrl && reason.sourceUrl !== reason.href ? (
                    <>
                      {" "}
                      <a href={reason.sourceUrl} rel="nofollow noopener noreferrer" target="_blank">
                        Source
                      </a>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {panel.info.length > 0 ? (
          <>
            <h3 className={styles.seoPanelSubheading}>{panel.labels.moreContext}</h3>
            <ul className={styles.seoPanelList}>
              {panel.info.map((reason) => (
                <li key={reason.id}>
                  <Link href={reason.href}>{reason.text}</Link>
                  {reason.sourceUrl && reason.sourceUrl !== reason.href ? (
                    <>
                      {" "}
                      <a href={reason.sourceUrl} rel="nofollow noopener noreferrer" target="_blank">
                        Source
                      </a>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {panel.why.length > 0 ? (
          <>
            <h3 className={styles.seoPanelSubheading}>{panel.labels.whyThisColor}</h3>
            <ul className={styles.seoPanelList}>
              {panel.why.map((reason) => (
                <li key={reason.id}>
                  <Link href={reason.href}>{reason.text}</Link>
                  {reason.sourceUrl && reason.sourceUrl !== reason.href ? (
                    <>
                      {" "}
                      <a href={reason.sourceUrl} rel="nofollow noopener noreferrer" target="_blank">
                        Source
                      </a>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <h3 className={styles.seoPanelSubheading}>{panel.labels.lawSnapshot}</h3>
        <ul className={styles.seoPanelList}>
          <li>
            <Link href={`/c/${data.code}#law-recreational`}>
              {seo.recreational}: {formatRecreationalDetail(card)}
            </Link>
          </li>
          <li>
            <Link href={`/c/${data.code}#law-medical`}>
              {seo.medical}: {formatMedicalDetail(card)}
            </Link>
          </li>
          <li>
            <Link href={`/c/${data.code}#law-distribution`}>
              {seo.distribution}: {formatDistributionDetail(card)}
            </Link>
          </li>
        </ul>
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
            <li key={item.code}>
              <Link href={`/c/${item.code}`}>{item.name}</Link>
            </li>
          ))}
        </ul>
      </section>

      {card.sources.length > 0 ? (
        <section className={styles.seoPanelSection}>
          <h3 className={styles.seoPanelSubheading}>{panel.labels.sources}</h3>
          <ul className={styles.seoPanelList}>
            {card.sources.map((source) => (
              <li key={source.id}>
                <a href={source.url} rel="nofollow noopener noreferrer" target="_blank">
                  {source.title}
                </a>
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
                <a href={source.url} rel="nofollow noopener noreferrer" target="_blank">
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={styles.seoPanelSection}>
        {card.detailsHref ? (
          <a href={card.detailsHref} rel="nofollow noopener noreferrer" target="_blank">
            {panel.labels.legalSource}
          </a>
        ) : (
          <span className={styles.seoPanelMuted}>{panel.labels.noDedicatedSource}</span>
        )}
      </section>
    </aside>
  );
}
