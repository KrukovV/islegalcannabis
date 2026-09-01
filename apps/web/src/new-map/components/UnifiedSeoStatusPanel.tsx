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
import { sanitizeEvidenceQuoteText } from "@/lib/text/sanitizeEvidenceQuoteText";
import TruthMapLegalEvidence from "@/truth-map/TruthMapLegalEvidence";
import { isTruthMapCurrentStatusAssertion } from "@/truth-map/truthMapRichCard";
import type { TruthMapFeatureProperties } from "@/truth-map/truthMapSource";
import type { CountryCardEntry } from "../map.types";
import styles from "../MapRoot.module.css";

export default function UnifiedSeoStatusPanel({
  data,
  entry,
  locale,
  onClose,
  onOpenContextDocument,
  truthMapPresentation = false,
  truthMapEvidence = null
}: {
  data?: CountryPageData | null;
  entry?: CountryCardEntry | null;
  locale: SeoLocale;
  onClose: () => void;
  /** Opens a canonical under-map document while retaining the current map context. */
  onOpenContextDocument?: (_href: string) => void;
  /** The Truth Map supplies the authoritative current legal projection. */
  truthMapPresentation?: boolean;
  /** The selected feature owns its citations, annotations and reconciliation rationale. */
  truthMapEvidence?: TruthMapFeatureProperties | null;
}) {
  const currentPath = usePathname() || "/";
  const card = entry || (data ? deriveCountryCardEntryFromCountryPageData(data) : null);
  if (!card) return null;
  // An explicit card is the owner of the current status.  In particular, a
  // Truth Map card is already projected from the final 307-GEO reconciliation;
  // never let a legacy country-page model overwrite its colour or conclusion.
  const entryOwnsCurrentLegalPresentation = Boolean(entry);
  const intents = entryOwnsCurrentLegalPresentation ? [] : data ? buildCountryIntentSections(data, { locale }) : [];
  const seo = getSeoText(locale);
  const localizedPanel = entryOwnsCurrentLegalPresentation
    ? localizePanelFromEntry(card, locale)
    : data ? localizePanel(card, data, locale) : localizePanelFromEntry(card, locale);
  const panelTitle = "title" in localizedPanel && typeof localizedPanel.title === "string" && localizedPanel.title
    ? localizedPanel.title
    : localizedPanel.labels.titleIn(localizedPanel.levelTitle, card.displayName.split(" / ")[0] || card.displayName);
  const panel = {
    ...localizedPanel,
    title: panelTitle
  };
  const panelLabels = truthMapPresentation
    ? {
        ...panel.labels,
        hardRestrictions: "Supplementary action-specific context — not the current legal conclusion",
        moreContext: "Supplementary scope notes — not the current legal conclusion"
      }
    : panel.labels;
  const jurisdictionContext = truthMapPresentation
    ? Array.from(new Set([
      card.parentLawSummary,
      ...(card.jurisdictionContextNotes || [])
    ]
      .map((item) => sanitizeEvidenceQuoteText(String(item || "")).trim())
      .filter(Boolean)))
    : [];
  const cannabisProfileSections = getCannabisProfileCardSections(card.cannabisProfile)
    .map((section) => ({
      ...section,
      // A profile is retained background, not a current legal verdict.  A
      // stale "legal/illegal" sentence can only be interpreted as a current
      // conclusion, so exclude it when Truth Map owns the status.
      items: truthMapPresentation
        ? section.items.filter((item) => !isTruthMapCurrentStatusAssertion(item))
        : section.items
    }))
    .filter((section) => section.items.length > 0);
  const lawSnapshotParagraphs = truthMapPresentation
    ? Array.from(new Set([panel.summary, card.normalizedStatusSummary].map((item) => String(item || "").trim()).filter(Boolean)))
    : entryOwnsCurrentLegalPresentation
      ? Array.from(new Set([panel.summary, card.normalizedStatusSummary, card.notes].map((item) => String(item || "").trim()).filter(Boolean)))
    : data
      ? [panel.summary, seo.intro(data)]
      : Array.from(new Set([panel.summary, card.normalizedStatusSummary, card.notes].map((item) => String(item || "").trim()).filter(Boolean)));
  const reasonLinkClass = (href: string) =>
    getLinkScope(href) === "project" ? styles.viewportPopupReasonLink : styles.viewportPopupSourceInlineLink;
  const isSelfLink = (href: string) => isSameLink(href, currentPath, currentPath);
  const isSameReasonSourceLink = (sourceUrl: string, reasonHref: string) =>
    isSelfLink(sourceUrl) || isSameLink(sourceUrl, reasonHref, currentPath);
  const renderLink = (href: string, label: string, contextKind?: CountryCardEntry["panel"]["critical"][number]["contextKind"]) => {
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
        <Link
          href={href}
          className={className}
          onClick={(event) => {
            if (contextKind !== "supplementary-map-context" || !onOpenContextDocument) return;
            event.preventDefault();
            onOpenContextDocument(href);
          }}
        >
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
    reasonItems: CountryCardEntry["panel"]["critical"],
    title: string
  ) =>
    reasonItems.length > 0 ? (
      <>
        <h3 className={styles.seoPanelSubheading}>{title}</h3>
        <ul className={styles.seoPanelList}>
          {reasonItems.map((reason) => (
            <li key={reason.id}>
              {!isSelfLink(reason.href) ? (
                renderLink(reason.href, reason.text, reason.contextKind)
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
          <div className={styles.eyebrow}>{(data?.node_type || card.type) === "state" ? panelLabels.eyebrowState : panelLabels.eyebrowCountry}</div>
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

      {truthMapPresentation && truthMapEvidence ? (
        <section className={styles.seoPanelSection} data-testid="truth-map-seo-authoritative-evidence">
          <h3 className={styles.seoPanelSubheading}>Authoritative legal evidence, citations and annotations</h3>
          <TruthMapLegalEvidence
            properties={truthMapEvidence}
            auditOnly={false}
            testId="truth-map-seo-legal-evidence"
          />
        </section>
      ) : null}

      {jurisdictionContext.length > 0 ? (
        <section className={styles.seoPanelSection} data-testid="truth-map-seo-jurisdiction">
          <h3 className={styles.seoPanelSubheading}>Jurisdiction and regulatory context — supplementary to current legal evidence</h3>
          <ul className={styles.seoPanelList}>
            {jurisdictionContext.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      ) : null}

      <section className={styles.seoPanelSection}>
        {renderReasonSection(panel.critical, panelLabels.hardRestrictions)}
        {renderReasonSection(panel.info, panelLabels.moreContext)}
        {renderReasonSection(panel.why, panelLabels.whyThisColor)}
        <h3 className={styles.seoPanelSubheading}>{panelLabels.lawSnapshot}</h3>
        {lawSnapshotParagraphs.map((paragraph, index) => (
          <p key={`${index}-${paragraph}`} className={styles.seoPanelIntro}>
            {paragraph}
          </p>
        ))}
      </section>

      {intents.length > 0 ? (
        <section className={styles.seoPanelSection}>
          <h3 className={styles.seoPanelSubheading}>{panelLabels.intent}</h3>
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
          <h3 className={styles.seoPanelSubheading}>{truthMapPresentation ? "Supplementary profile context — not the current legal conclusion" : "Cannabis profile"}</h3>
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
        <h3 className={styles.seoPanelSubheading}>{panelLabels.related}</h3>
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
          <h3 className={styles.seoPanelSubheading}>{panelLabels.sources}</h3>
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
          <h3 className={styles.seoPanelSubheading}>{panelLabels.sources}</h3>
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
          renderSourceLink(card.detailsHref, panelLabels.legalSource)
        ) : (
          <span className={styles.seoPanelMuted}>{panelLabels.noDedicatedSource}</span>
        )}
      </section>
    </aside>
  );
}
