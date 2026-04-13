import type { ResultStatusLevel, ResultViewModel } from "@islegal/shared";
import Link from "next/link";
import styles from "./ResultCard.module.css";

function levelTitle(level: ResultStatusLevel, humanStatus: string) {
  if (level === "green") return humanStatus || "Legal";
  if (level === "yellow") return humanStatus || "Restricted or partly allowed";
  if (level === "red") return humanStatus || "Illegal";
  return humanStatus || "No reliable data";
}

function ReasonLink({
  href,
  text
}: {
  href: string;
  text: string;
}) {
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={styles.statusReasonMainLink}>
        {text}
      </Link>
    );
  }
  return (
    <a href={href} className={styles.statusReasonMainLink}>
      {text}
    </a>
  );
}

export default function StatusPanel({
  statusLevel,
  statusTitle,
  panel
}: {
  statusLevel: ResultViewModel["statusLevel"];
  statusTitle: string;
  panel: ResultViewModel["statusPanel"];
}) {
  if (!panel) {
    return (
      <section className={styles.section}>
        <h2>Status</h2>
        <div className={styles.statusHeroBadge} data-testid="status-panel-badge" data-level={statusLevel}>
          <span className={styles.statusHeroDot} aria-hidden="true" />
          <span className={styles.statusHeroLabel}>{statusTitle}</span>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.section} data-testid="status-panel">
      <h2>Status</h2>
      <div className={styles.statusHero}>
        <div className={styles.statusHeroBadge} data-testid="status-panel-badge" data-level={statusLevel}>
          <span className={styles.statusHeroDot} aria-hidden="true" />
          <span className={styles.statusHeroLabel}>{levelTitle(statusLevel, panel.humanStatus)}</span>
        </div>
        <div className={styles.statusSummaryBlock}>
          <p className={styles.statusSummary}>{panel.summary}</p>
          {panel.lastUpdateLabel ? (
            <p className={styles.statusTimestamp}>Updated: {panel.lastUpdateLabel}</p>
          ) : null}
          {panel.countryPageHref ? (
            <Link href={panel.countryPageHref} className={styles.statusJumpLink}>
              Open country page
            </Link>
          ) : null}
        </div>
      </div>

      {panel.critical.length > 0 ? (
        <div className={styles.statusReasonsBlock}>
          <h3 className={styles.statusSubheading}>❗ Hard restrictions</h3>
          <ul className={styles.statusReasonList}>
            {panel.critical.map((reason) => (
              <li key={reason.id} className={styles.statusReasonItem}>
                <ReasonLink href={reason.href} text={reason.text} />
                {reason.sourceUrl && reason.sourceUrl !== reason.href ? (
                  <a
                    href={reason.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.statusSourceLink}
                  >
                    Source
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {panel.info.length > 0 ? (
        <div className={styles.statusReasonsBlock}>
          <h3 className={styles.statusSubheading}>ℹ️ More context</h3>
          <ul className={styles.statusReasonList}>
            {panel.info.map((reason) => (
              <li key={reason.id} className={styles.statusReasonItem}>
                <ReasonLink href={reason.href} text={reason.text} />
                {reason.sourceUrl && reason.sourceUrl !== reason.href ? (
                  <a
                    href={reason.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.statusSourceLink}
                  >
                    Source
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {panel.why.length > 0 ? (
        <div className={styles.statusReasonsBlock}>
          <h3 className={styles.statusSubheading}>Why this status?</h3>
          <ul className={styles.statusReasonList}>
            {panel.why.map((reason) => (
              <li key={reason.id} className={styles.statusReasonItem}>
                <ReasonLink href={reason.href} text={reason.text} />
                {reason.sourceUrl && reason.sourceUrl !== reason.href ? (
                  <a
                    href={reason.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.statusSourceLink}
                  >
                    Source
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
