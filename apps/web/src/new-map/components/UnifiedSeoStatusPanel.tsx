"use client";

import Link from "next/link";
import type { CountryPageData } from "@/lib/countryPageStorage";
import { deriveCountryCardEntryFromCountryPageData } from "@/lib/countryCardEntry";
import { buildCountryIntentSections } from "@/lib/seo/countryIntentContent";
import { formatDistributionDetail, formatMedicalDetail, formatRecreationalDetail } from "../statusPresentation";
import styles from "../MapRoot.module.css";

export default function UnifiedSeoStatusPanel({
  data,
  onClose
}: {
  data: CountryPageData;
  onClose: () => void;
}) {
  const card = deriveCountryCardEntryFromCountryPageData(data);
  const intents = buildCountryIntentSections(data);
  const label = data.name.split(" / ")[0] || data.name;

  return (
    <aside className={styles.seoOverlayPanel} data-testid="new-map-seo-overlay">
      <div className={styles.seoPanelHeader}>
        <div>
          <div className={styles.eyebrow}>{data.node_type === "state" ? "State View" : "Country View"}</div>
          <div className={styles.unifiedPanelStatusRow}>
            <span className={styles.unifiedPanelStatusBadge} data-category={card.mapCategory}>
              {card.panel.levelTitle}
            </span>
            <h2 className={styles.seoPanelStatusTitle}>{card.panel.levelTitle} in {label}</h2>
          </div>
          <p className={styles.seoPanelIntro}>{card.panel.summary}</p>
        </div>
        <button type="button" className={styles.seoPanelClose} onClick={onClose} aria-label="Close country info">
          ×
        </button>
      </div>

      <section className={styles.seoPanelSection}>
        {card.panel.critical.length > 0 ? (
          <>
            <h3 className={styles.seoPanelSubheading}>Hard restrictions</h3>
            <ul className={styles.seoPanelList}>
              {card.panel.critical.map((reason) => (
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
        {card.panel.info.length > 0 ? (
          <>
            <h3 className={styles.seoPanelSubheading}>More context</h3>
            <ul className={styles.seoPanelList}>
              {card.panel.info.map((reason) => (
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
        {card.panel.why.length > 0 ? (
          <>
            <h3 className={styles.seoPanelSubheading}>Why this color</h3>
            <ul className={styles.seoPanelList}>
              {card.panel.why.map((reason) => (
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
        <h3 className={styles.seoPanelSubheading}>Law snapshot</h3>
        <ul className={styles.seoPanelList}>
          <li>
            <Link href={`/c/${data.code}#law-recreational`}>
              Recreational: {formatRecreationalDetail(card)}
            </Link>
          </li>
          <li>
            <Link href={`/c/${data.code}#law-medical`}>
              Medical: {formatMedicalDetail(card)}
            </Link>
          </li>
          <li>
            <Link href={`/c/${data.code}#law-distribution`}>
              Distribution: {formatDistributionDetail(card)}
            </Link>
          </li>
        </ul>
        <p className={styles.seoPanelIntro}>{data.notes_normalized}</p>
      </section>

      <section className={styles.seoPanelSection}>
        <h3 className={styles.seoPanelSubheading}>Intent</h3>
        {intents.map((intent) => (
          <div key={intent.id} className={styles.unifiedPanelIntentBlock}>
            <p className={styles.unifiedPanelIntentTitle}>{intent.heading}</p>
            <p>{intent.body}</p>
          </div>
        ))}
      </section>

      <section className={styles.seoPanelSection}>
        <h3 className={styles.seoPanelSubheading}>Related</h3>
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
          <h3 className={styles.seoPanelSubheading}>Sources</h3>
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
          <h3 className={styles.seoPanelSubheading}>Sources</h3>
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
            Legal source →
          </a>
        ) : (
          <span className={styles.seoPanelMuted}>No dedicated Cannabis_in_* source.</span>
        )}
      </section>
    </aside>
  );
}
