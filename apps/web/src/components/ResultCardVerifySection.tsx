import VerifyNowButton from "@/components/VerifyNowButton";
import styles from "./ResultCard.module.css";

type SourceLink = {
  title: string;
  url: string;
};

type EvidenceLink = {
  kind: string;
  ref: string;
  quote: string;
};

type FactItem = {
  url?: string;
  category?: string;
  effective_date?: string | null;
};

type ArticleItem = {
  url?: string;
  title?: string;
};

type ResultCardVerifySectionProps = {
  machineVerifiedBadge: boolean;
  profileStatus: string;
  legalSsotPresent: boolean;
  wikiClaimUrl: string | null;
  wikiClaimRecreational: string;
  wikiClaimMedical: string;
  wikiClaimArticles: ArticleItem[];
  wikiClaimPresent: boolean;
  wikiNotesText: string;
  wikiNotesRev: string;
  wikiNotesMainArticle: string;
  wikiNotesSections: unknown[];
  showWikiTrust: boolean;
  wikiTrustLabel: string;
  ssotChanged: boolean;
  machineVerifiedEntryPresent: boolean;
  ssotSnapshotDate: string | null;
  verifyReason: string | null;
  offlineFallback: boolean;
  offlineNote?: string | null;
  profileId: string;
  machineVerifiedAt: string | null;
  nowIso: string | null;
  showEvidenceLinks: boolean;
  evidenceLinks: EvidenceLink[];
  machineVerifiedSourceUrl: string | null;
  machineVerifiedSnapshotDate: string | null;
  verifyLinksLabel: string;
  ssotOfficialLinks: SourceLink[];
  officialVerifySources: SourceLink[];
  showVerifyLinks: boolean;
  combinedVerifyLinks: SourceLink[];
  limitedFacts: FactItem[];
  profileUpdatedAt?: string | null;
};

function sourceHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function wikiStatusLabel(value: string) {
  if (value === "Decrim") return "Decriminalized";
  if (value === "Unenforced") return "Unenforced";
  if (value === "Legal") return "Legal";
  if (value === "Illegal") return "Illegal";
  if (value === "Limited") return "Limited";
  return "Not confirmed";
}

export default function ResultCardVerifySection({
  machineVerifiedBadge,
  profileStatus,
  legalSsotPresent,
  wikiClaimUrl,
  wikiClaimRecreational,
  wikiClaimMedical,
  wikiClaimArticles,
  wikiClaimPresent,
  wikiNotesText,
  wikiNotesRev,
  wikiNotesMainArticle,
  wikiNotesSections,
  showWikiTrust,
  wikiTrustLabel,
  ssotChanged,
  machineVerifiedEntryPresent,
  ssotSnapshotDate,
  verifyReason,
  offlineFallback,
  offlineNote,
  profileId,
  machineVerifiedAt,
  nowIso,
  showEvidenceLinks,
  evidenceLinks,
  machineVerifiedSourceUrl,
  machineVerifiedSnapshotDate,
  verifyLinksLabel,
  ssotOfficialLinks,
  officialVerifySources,
  showVerifyLinks,
  combinedVerifyLinks,
  limitedFacts,
  profileUpdatedAt
}: ResultCardVerifySectionProps) {
  return (
    <section className={styles.section} data-testid="verify-yourself">
      <h3>Verify yourself</h3>
      {machineVerifiedBadge ? (
        <p className={styles.provisionalBanner} data-testid="auto-verified-badge">
          Machine verified
        </p>
      ) : profileStatus === "needs_review" ? (
        <p className={styles.provisionalBanner} data-testid="candidate-badge">
          Candidate (unreviewed)
        </p>
      ) : legalSsotPresent ? (
        <p className={styles.provisionalBanner} data-testid="candidate-uncertain-badge">
          Candidate/Uncertain
        </p>
      ) : (
        <p className={styles.provisionalBanner} data-testid="unknown-badge">
          Not confirmed (no verified law page yet)
        </p>
      )}
      {wikiClaimUrl ? (
        <div className={styles.updated} data-testid="wiki-claim">
          <a href={wikiClaimUrl} target="_blank" rel="noreferrer">
            по Wiki
          </a>
          : Recreational {wikiStatusLabel(wikiClaimRecreational)} · Medical{" "}
          {wikiStatusLabel(wikiClaimMedical)}
        </div>
      ) : null}
      {wikiClaimArticles.length > 0 ? (
        <ul className={styles.sources} data-testid="wiki-main-articles">
          {wikiClaimArticles.slice(0, 3).map((article) => (
            <li key={article.url} className={styles.sourceItem}>
              <a className={styles.sourceLink} href={article.url} target="_blank" rel="noreferrer">
                <span className={styles.sourceTitle}>{article.title || "Main article"}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {wikiClaimPresent ? (
        <div className={styles.updated} data-testid="wiki-notes">
          <div>
            {wikiNotesText ? "Notes" : "Notes (placeholder)"}
            {wikiNotesRev ? ` · from wiki rev=${wikiNotesRev}` : ""}
            {wikiNotesMainArticle ? ` · source=${wikiNotesMainArticle}` : ""}
          </div>
          {wikiNotesSections.length > 0 ? <div>Sections: {wikiNotesSections.join(", ")}</div> : null}
          <div>{wikiNotesText || "No notes yet."}</div>
        </div>
      ) : null}
      {showWikiTrust ? (
        <div className={styles.updated} data-testid="wiki-links-trust">
          {wikiTrustLabel}
        </div>
      ) : null}
      {ssotChanged ? (
        <div className={styles.updated} data-testid="ssot-changed">
          Sources changed recently — please verify.
        </div>
      ) : null}
      {!machineVerifiedEntryPresent && !ssotSnapshotDate ? (
        <div className={styles.updated} data-testid="no-snapshot">
          No snapshots yet.
        </div>
      ) : null}
      {!machineVerifiedBadge && verifyReason ? (
        <div className={styles.updated} data-testid="verify-reason">
          Not confirmed / not verified yet: {verifyReason}
        </div>
      ) : null}
      {offlineFallback ? (
        <div className={styles.updated} data-testid="offline-fallback">
          {offlineNote ?? "Source: offline verified snapshot"}
        </div>
      ) : null}
      <VerifyNowButton iso={profileId} verifiedAt={machineVerifiedAt} nowIso={nowIso} />
      {showEvidenceLinks ? (
        <>
          <p className={styles.updated}>{verifyLinksLabel}</p>
          <ul className={styles.sources} data-testid="verify-evidence-links">
            {evidenceLinks.slice(0, 3).map((item, index) => (
              <li key={`${item.ref}-${index}`} className={styles.sourceItem}>
                <a className={styles.sourceLink} href={machineVerifiedSourceUrl ?? ""} target="_blank" rel="noreferrer">
                  <span className={styles.sourceTitle}>Official source</span>
                  <span className={styles.sourceHost}>
                    Snapshot {machineVerifiedSnapshotDate ?? "n/a"} · {item.kind === "pdf_page" ? "Page" : "Anchor"}:{" "}
                    {item.ref}
                    {item.quote ? ` · "${item.quote}"` : ""}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {ssotChanged && ssotOfficialLinks.length > 0 ? (
        <ul className={styles.sources} data-testid="ssot-changed-links">
          {ssotOfficialLinks.map((source) => (
            <li key={source.url} className={styles.sourceItem}>
              <a className={styles.sourceLink} href={source.url} target="_blank" rel="noreferrer">
                <span className={styles.sourceTitle}>{source.title}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {officialVerifySources.length > 0 ? (
        <>
          <p className={styles.updated}>Official sources</p>
          <ul className={styles.sources} data-testid="verify-sources">
            {officialVerifySources.map((source) => (
              <li key={source.url} className={styles.sourceItem}>
                <a className={styles.sourceLink} href={source.url} target="_blank" rel="noreferrer">
                  <span className={styles.sourceTitle}>{source.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {showVerifyLinks ? (
        <>
          <ul className={styles.sources} data-testid="verify-links">
            {combinedVerifyLinks.map((source) => (
              <li key={source.url} className={styles.sourceItem}>
                <a className={styles.sourceLink} href={source.url} target="_blank" rel="noreferrer">
                  <span className={styles.sourceTitle}>{source.title}</span>
                  <span className={styles.sourceHost}>{sourceHostname(source.url)}</span>
                </a>
              </li>
            ))}
          </ul>
          {limitedFacts.length > 0 ? (
            <ul className={styles.sources} data-testid="verify-facts">
              {limitedFacts.map((fact, index) => (
                <li key={`${fact.url}-${index}`} className={styles.sourceItem}>
                  <span className={styles.sourceTitle}>{fact.category}</span>
                  {fact.effective_date ? <span className={styles.sourceHost}>{fact.effective_date}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <p className={styles.updated} data-testid="verify-empty">
          ⚠️ No verified sources yet.
        </p>
      )}
      {officialVerifySources.length === 0 ? (
        <p className={styles.updated} data-testid="verify-official-empty">
          ⚠️ No verified official sources yet.
        </p>
      ) : null}
      {ssotSnapshotDate ? (
        <p className={styles.updated} data-testid="verify-snapshot">
          Snapshot date: {ssotSnapshotDate}
        </p>
      ) : null}
      {profileUpdatedAt ? (
        <p className={styles.updated} data-testid="updated-at">
          Last updated: {profileUpdatedAt}
        </p>
      ) : null}
      {!showVerifyLinks && (profileStatus === "provisional" || profileStatus === "needs_review") ? (
        <p className={styles.provisionalBanner}>
          {profileStatus === "provisional" ? "Provisional" : "Needs review"}
        </p>
      ) : null}
    </section>
  );
}
