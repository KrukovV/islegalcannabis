import type { JurisdictionLawProfile, ResultViewModel } from "@islegal/shared";
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
import { statusIconForExtras } from "@/lib/extras";

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
  const showExtras = extrasList.length > 0;

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
        </div>
      </header>

      <section className={styles.section}>
        <h2>Status</h2>
        <StatusBadge
          level={resolvedViewModel.statusLevel}
          label={resolvedViewModel.statusTitle}
        />
      </section>

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

      {renderRisks || renderSources || renderPdf ? (
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
            <section className={styles.section}>
              <h2>Sources</h2>
              <p className={styles.updated}>Verified: {verifiedLabel}</p>
              <p className={styles.updated}>
                Last updated: {resolvedViewModel.updatedAt}
              </p>
              <ul className={styles.sources}>
                {resolvedViewModel.sources.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.title}
                    </a>
                  </li>
                ))}
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
