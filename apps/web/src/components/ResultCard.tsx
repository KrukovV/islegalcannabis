import type { JurisdictionLawProfile, ResultViewModel } from "@islegal/shared";
import { STATUS_BANNERS } from "@islegal/shared";
import type { LocationContext } from "@/lib/location/locationContext";
import type { ReactNode } from "react";
import StatusBadge from "./StatusBadge";
import Disclaimer from "./Disclaimer";
import styles from "./ResultCard.module.css";
import UpgradePrompt from "./UpgradePrompt";
import LocationMeta from "@/components/LocationMeta";
import RecentResultBadge from "@/components/RecentResultBadge";
import { hashLawProfile } from "@/lib/profileHash";
import { buildTripStatusCode } from "@/lib/tripStatus";
import { buildResultViewModel } from "@/lib/resultViewModel";
import { buildExtrasCards, statusIconForExtras } from "@/lib/extras";
import Link from "next/link";
import { shouldHighlightManualAction } from "@/lib/geo/locationResolution";
import { toLocationResolution } from "@/lib/location/locationContext";

type ResultCardProps = {
  profile: JurisdictionLawProfile;
  title: string;
  kicker?: string;
  subtitle?: string;
  showJurisdiction?: boolean;
  simpleTerms?: ReactNode;
  isPaidUser?: boolean;
  maxBullets?: number;
  showRisks?: boolean;
  showSources?: boolean;
  showPdf?: boolean;
  showUpgradePrompt?: boolean;
  locationContext?: LocationContext;
  cacheCell?: string | null;
  viewModel?: ResultViewModel;
  showLocationMeta?: boolean;
};

const countryFlag: Record<string, string> = {
  US: "🇺🇸",
  DE: "🇩🇪"
};

export default function ResultCard({
  profile,
  title,
  kicker = "Result card",
  subtitle,
  showJurisdiction = true,
  simpleTerms,
  isPaidUser = true,
  maxBullets,
  showRisks,
  showSources,
  showPdf,
  showUpgradePrompt,
  locationContext,
  cacheCell,
  viewModel,
  showLocationMeta = true
}: ResultCardProps) {
  const resolvedViewModel =
    viewModel ??
    buildResultViewModel({
      profile,
      title,
      locationContext
    });
  const statusCode = buildTripStatusCode(profile);
  const profileHash = hashLawProfile(profile);
  const flag = countryFlag[profile.country] ?? "🏳️";

  const bullets = resolvedViewModel.bullets;
  const bulletLimit = maxBullets ?? (isPaidUser ? bullets.length : 3);
  const visibleBullets = bullets.slice(0, bulletLimit);
  const risks = resolvedViewModel.keyRisks;
  const needsVerification = profile.status !== "known";
  const renderRisks = showRisks ?? isPaidUser;
  const renderSources = showSources ?? (isPaidUser || needsVerification);
  const renderPdf = showPdf ?? isPaidUser;
  const renderUpgrade = showUpgradePrompt ?? !isPaidUser;
  const verifiedLabel = resolvedViewModel.verifiedAt ?? "Not verified";
  const primarySource = resolvedViewModel.sources[0]?.url;
  const extrasList =
    resolvedViewModel.meta?.paid
      ? resolvedViewModel.extrasFull ?? []
      : resolvedViewModel.extrasPreview ?? [];
  const extrasCards = buildExtrasCards(profile, 3);
  const showExtras = extrasList.length > 0;
  const showExtrasCards = extrasCards.length > 0;
  const hasBorderRisk = profile.risks.includes("border_crossing");
  const canWarn = profile.status === "known";
  const showWarning =
    canWarn && (resolvedViewModel.statusLevel === "red" || hasBorderRisk);
  const nearestLegal = resolvedViewModel.nearestLegal ?? null;
  const requestId = resolvedViewModel.meta?.requestId ?? null;
  const highlightChange = shouldHighlightManualAction(
    toLocationResolution(locationContext ?? null)
  );

  return (
    <div className={styles.card}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>{kicker}</p>
          <h1>{resolvedViewModel.title}</h1>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          {showJurisdiction ? (
            <p className={styles.jurisdiction}>
              <span className={styles.flag}>{flag}</span>
              {profile.id}
            </p>
          ) : null}
          {locationContext && showLocationMeta ? (
            <LocationMeta
              className={styles.locationMeta}
              labelClassName={styles.locationLabel}
              hintClassName={styles.locationHint}
              context={locationContext}
            />
          ) : null}
          {locationContext ? (
            <RecentResultBadge
              className={styles.cacheBadge}
              jurisdictionKey={profile.id}
              country={profile.country}
              region={profile.region}
              statusCode={statusCode}
              statusLevel={resolvedViewModel.statusLevel}
              profileHash={profileHash}
              verifiedAt={profile.verified_at ?? undefined}
              lawUpdatedAt={profile.updated_at}
              sources={profile.sources}
              locationContext={locationContext}
              cell={cacheCell ?? undefined}
            />
          ) : null}
          <div className={styles.metaRow}>
            {requestId ? (
              <span className={styles.metaLabel}>
                Request ID: {requestId.slice(0, 8)}
              </span>
            ) : null}
            <Link
              className={`${styles.changeLocation} ${
                highlightChange ? styles.changeLocationHighlight : ""
              }`}
              href="/"
            >
              Change location
            </Link>
          </div>
        </div>
      </header>

      <section className={styles.section}>
        <h2>Status</h2>
        <StatusBadge
          level={resolvedViewModel.statusLevel}
          label={resolvedViewModel.statusTitle}
        />
        {profile.status === "provisional" ? (
          <p className={styles.provisionalBanner}>
            {STATUS_BANNERS.provisional.body}
          </p>
        ) : null}
        {profile.status === "needs_review" ? (
          <p className={styles.provisionalBanner}>
            {STATUS_BANNERS.needs_review.body}
          </p>
        ) : null}
      </section>

      {showWarning ? (
        <section className={styles.warning} data-testid="warning">
          <div className={styles.warningHeader}>
            <span className={styles.warningIcon} aria-hidden="true">
              ⚠️
            </span>
            <div className={styles.warningText}>
              <h2 data-testid="warning-title">Warning</h2>
              {resolvedViewModel.statusLevel === "red" ? (
                <p>Not legal here.</p>
              ) : null}
              {hasBorderRisk ? <p>Border crossing is illegal.</p> : null}
              {nearestLegal ? (
                <p data-testid="nearest-legal">
                  Nearest place where status is green/yellow: {nearestLegal.title} (
                  ~{Math.round(nearestLegal.distanceKm)} km, approx)
                </p>
              ) : null}
            </div>
          </div>
          <p className={styles.warningDisclaimer}>
            Approximate. Verify local rules.
          </p>
        </section>
      ) : null}

      {simpleTerms ? (
        <section className={styles.section}>{simpleTerms}</section>
      ) : null}

      <section className={styles.section}>
        <h2>Details</h2>
        <ul className={styles.bullets}>
          {visibleBullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      {renderRisks || renderSources || renderPdf || showExtrasCards ? (
        <>
          {renderRisks ? (
            <section className={styles.section}>
              <h2>Key risks</h2>
              <ul className={styles.risks}>
                {risks.map((risk) => (
                  <li key={risk}>{risk}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {renderSources ? (
            <section className={styles.section} data-testid="sources">
              <h2>Sources</h2>
              <p className={styles.updated}>Verified: {verifiedLabel}</p>
              <p className={styles.updated}>
                Last updated: {resolvedViewModel.updatedAt}
              </p>
              <ul className={styles.sources}>
                {resolvedViewModel.sources.map((source) => {
                  let host = "";
                  try {
                    host = new URL(source.url).hostname;
                  } catch {
                    host = "";
                  }
                  return (
                    <li key={source.url} className={styles.sourceItem}>
                      <a
                        className={styles.sourceLink}
                        data-testid="source-link"
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span className={styles.sourceTitle}>{source.title}</span>
                        {host ? (
                          <span className={styles.sourceHost}>{host}</span>
                        ) : null}
                      </a>
                    </li>
                  );
                })}
              </ul>
              {needsVerification && primarySource ? (
                <a
                  className={styles.sourceButton}
                  href={primarySource}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open official sources
                </a>
              ) : null}
            </section>
          ) : null}

          {showExtrasCards ? (
            <section className={styles.section} data-testid="extras-cards">
              <h2>Key extras</h2>
              <div className={styles.extrasCards}>
                {extrasCards.map((card) => (
                  <div
                    key={card.key}
                    className={styles.extrasCard}
                    data-testid="extras-card"
                  >
                    <div className={styles.extrasCardHeader}>
                      <span className={styles.extrasCardTitle}>
                        {card.title}
                      </span>
                      <span className={styles.extrasCardValue}>
                        {card.value}
                      </span>
                    </div>
                    <p className={styles.extrasCardBody}>{card.whyMatters}</p>
                    <p className={styles.extrasCardHint}>
                      {card.userActionHint}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {renderPdf ? (
            <section className={styles.section}>
              <h2>PDF export</h2>
              <p className={styles.updated}>Coming soon.</p>
            </section>
          ) : null}
        </>
      ) : null}

      {renderUpgrade ? (
        <section className={styles.section}>
          <UpgradePrompt />
        </section>
      ) : null}

      {showExtras ? (
        <section className={styles.section}>
          <h2>What else is legal here?</h2>
          <ul className={styles.extras}>
            {extrasList.map((item) => (
              <li key={item.key}>
                <span className={styles.extrasIcon}>
                  {statusIconForExtras(item.value)}
                </span>
                <span className={styles.extrasLabel}>{item.label}:</span>
                <span className={styles.extrasValue}>{item.value}</span>
              </li>
            ))}
          </ul>
          {resolvedViewModel.meta?.paid ? null : (
            <p className={styles.extrasLock}>Unlock full list</p>
          )}
          <div className={styles.extrasMeta}>
            <p>Sources: {resolvedViewModel.sources[0]?.title ?? "Official sources"}</p>
            <p>Verified: {verifiedLabel}</p>
            <p>Educational only. Not legal advice.</p>
          </div>
        </section>
      ) : null}

      <Disclaimer />
    </div>
  );
}
