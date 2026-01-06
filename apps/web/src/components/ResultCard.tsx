import { computeStatus } from "@islegal/shared";
import type { JurisdictionLawProfile } from "@islegal/shared";
import type { ReactNode } from "react";
import StatusBadge from "./StatusBadge";
import Disclaimer from "./Disclaimer";
import styles from "./ResultCard.module.css";
import { buildBullets, buildRisks } from "@/lib/summary";
import UpgradePrompt from "./UpgradePrompt";

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
  showUpgradePrompt
}: ResultCardProps) {
  const status = computeStatus(profile);
  const flag = countryFlag[profile.country] ?? "🏳️";

  const bullets = buildBullets(profile);
  const bulletLimit = maxBullets ?? (isPaidUser ? bullets.length : 3);
  const visibleBullets = bullets.slice(0, bulletLimit);
  const risks = buildRisks(profile);
  const renderRisks = showRisks ?? isPaidUser;
  const renderSources = showSources ?? isPaidUser;
  const renderPdf = showPdf ?? isPaidUser;
  const renderUpgrade = showUpgradePrompt ?? !isPaidUser;

  return (
    <div className={styles.card}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>{kicker}</p>
          <h1>{title}</h1>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          {showJurisdiction ? (
            <p className={styles.jurisdiction}>
              <span className={styles.flag}>{flag}</span>
              {profile.id}
            </p>
          ) : null}
        </div>
      </header>

      <section className={styles.section}>
        <h2>Status</h2>
        <StatusBadge status={status} />
      </section>

      {simpleTerms ? (
        <section className={styles.section}>{simpleTerms}</section>
      ) : null}

      <section className={styles.section}>
        <h2>Details</h2>
        <ul className={styles.bullets}>
          {visibleBullets.map((item) => (
            <li key={item.label}>
              <span>{item.label}:</span> {item.value}
            </li>
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
              <p className={styles.updated}>Last updated: {profile.updated_at}</p>
              <ul className={styles.sources}>
                {profile.sources.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.title}
                    </a>
                  </li>
                ))}
              </ul>
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

      <Disclaimer />
    </div>
  );
}
