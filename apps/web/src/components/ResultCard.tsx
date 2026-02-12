import type {
  JurisdictionLawProfile,
  ResultStatusLevel,
  ResultViewModel
} from "@islegal/shared";
import {
  buildWhyBullets,
  extrasFromProfile,
  levelFromStatus,
  normalizeSourceList,
  STATUS_BANNERS,
  titleFromLevel
} from "@islegal/shared";
import type { LocationContext } from "@/lib/location/locationContext";
import type { ReactNode } from "react";
import StatusBadge from "./StatusBadge";
import Disclaimer from "./Disclaimer";
import styles from "./ResultCard.module.css";
import UpgradePrompt from "./UpgradePrompt";
import LocationMeta from "@/components/LocationMeta";
import NearbyPaidSection from "@/components/NearbyPaidSection";
import RecentResultBadge from "@/components/RecentResultBadge";
import VerifyNowButton from "@/components/VerifyNowButton";
import { hashLawProfile } from "@/lib/profileHash";
import { buildTripStatusCode } from "@/lib/tripStatus";
import { buildResultViewModel } from "@/lib/resultViewModel";
import { buildExtrasCards, statusIconForExtras } from "@/lib/extras";
import Link from "next/link";
import { shouldHighlightManualAction } from "@/lib/geo/locationResolution";
import { toLocationResolution } from "@/lib/location/locationContext";
import { FEATURES } from "@/lib/features";

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
  pagesOk?: number | null;
  pagesTotal?: number | null;
  nearby?: Array<{ id: string; status: string; summary: string; name?: string; flag?: string }>;
  isPro?: boolean;
  proPreviewHref?: string;
  wikiLinks?: Array<{
    url?: string;
    title?: string;
    section?: string;
    source?: string;
  }>;
  linksTrust?: {
    official_count?: number;
    total_count?: number;
    official_matches?: unknown[];
    non_official?: unknown[];
    last_checked_at?: string | null;
  };
  advancedNearest?: {
    id: string;
    name: string;
    level: ResultStatusLevel;
    distanceKm: number;
    sourcesCount: number;
  };
};

const countryFlag: Record<string, string> = {
  US: "🇺🇸",
  DE: "🇩🇪"
};

function confidenceLabel(confidence: "high" | "medium" | "low") {
  if (confidence === "high") return "High";
  if (confidence === "medium") return "Medium";
  return "Low";
}

function levelLabel(level: ResultStatusLevel) {
  if (level === "green") return "Legal";
  if (level === "yellow") return "Restricted";
  if (level === "red") return "Illegal";
  return "Not confirmed";
}

function levelIcon(level: ResultStatusLevel) {
  if (level === "green") return "✅";
  if (level === "yellow") return "⚠️";
  if (level === "red") return "⛔";
  return "⚪";
}

function wikiStatusLabel(value: string) {
  if (value === "Decrim") return "Decriminalized";
  if (value === "Unenforced") return "Unenforced";
  if (value === "Legal") return "Legal";
  if (value === "Illegal") return "Illegal";
  if (value === "Limited") return "Limited";
  return "Not confirmed";
}

function levelFromLawStatus(value: string): ResultStatusLevel {
  if (value === "allowed") return "green";
  if (value === "restricted") return "yellow";
  return "red";
}

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
  showLocationMeta = true,
  pagesOk,
  pagesTotal,
  nearby,
  isPro = false,
  proPreviewHref,
  advancedNearest,
  wikiLinks,
  linksTrust
}: ResultCardProps) {
  const resolvedViewModel =
    viewModel ??
    buildResultViewModel({
      profile,
      title,
      locationContext
    });
  const statusCode = buildTripStatusCode(profile);
  const resultLevel = levelFromStatus(statusCode);
  const resultTitle = titleFromLevel(resultLevel, statusCode);
  const officialSources = normalizeSourceList(
    Array.isArray(profile.official_sources)
      ? profile.official_sources.map((url) => ({
          title: "Official source",
          url
        }))
      : []
  );
  const neutralSources = normalizeSourceList(profile.sources);
  const linksTrustSafe = linksTrust ?? null;
  const wikiTrustOfficial = Number(linksTrustSafe?.official_count || 0) || 0;
  const hasVerifiedSources = wikiTrustOfficial > 0;
  const displayLevel =
    hasVerifiedSources || resultLevel !== "green" ? resultLevel : "yellow";
  const displayTitle =
    hasVerifiedSources || resultLevel !== "green"
      ? resultTitle
      : "Needs verification";
  const resultIcon =
    displayLevel === "green" ? "✅" : displayLevel === "yellow" ? "⚠️" : "❌";
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
  const paidExtras = resolvedViewModel.extrasFull ?? resolvedViewModel.extrasPreview ?? [];
  const previewExtras =
    resolvedViewModel.extrasPreview ?? resolvedViewModel.extrasFull ?? [];
  const extrasList = (isPaidUser ? paidExtras.slice(0, 5) : previewExtras.slice(0, 2));
  const extrasCards = buildExtrasCards(profile, 3);
  const showExtras = extrasList.length > 0;
  const showExtrasCards = isPaidUser && extrasCards.length > 0;
  const hasBorderRisk = profile.risks.includes("border_crossing");
  const canWarn = profile.status === "known";
  const showWarning =
    canWarn && (resolvedViewModel.statusLevel === "red" || hasBorderRisk);
  const nearestLegal = resolvedViewModel.nearestLegal ?? null;
  const requestId = resolvedViewModel.meta?.requestId ?? null;
  const highlightChange = shouldHighlightManualAction(
    toLocationResolution(locationContext ?? null)
  );
  const pagesOkValue = typeof pagesOk === "number" ? pagesOk : null;
  const pagesTotalValue = typeof pagesTotal === "number" ? pagesTotal : null;
  const showPagesMetrics = pagesOkValue !== null && pagesTotalValue !== null;
  const showNearby =
    resolvedViewModel.statusLevel === "red" &&
    Array.isArray(nearby) &&
    nearby.length > 0;
  const showPaidPreview =
    !isPaidUser &&
    (extrasCards.length > 0 ||
      Boolean(nearestLegal) ||
      (Array.isArray(nearby) && nearby.length > 0));
  const paidExtrasEnabled = FEATURES.paidExtras;
  const whyBullets = buildWhyBullets(profile);
  const visibleWhyBullets = whyBullets
    .filter((bullet) => !bullet.toLowerCase().startsWith("medical use:"))
    .slice(0, 3);
  const locationMethod = resolvedViewModel.location.method;
  const locationConfidence = resolvedViewModel.location.confidence;
  const limitedOfficialSources = officialSources.slice(0, 1);
  const limitedNeutralSources = neutralSources.slice(0, 1);
  const ssotOfficialLinks = officialSources.slice(0, 2);
  const verifyLinks = [...limitedOfficialSources, ...limitedNeutralSources];
  const facts = Array.isArray(profile.facts) ? profile.facts : [];
  const limitedFacts = facts.slice(0, 2);
  const advancedExtras = extrasFromProfile(profile);
  const medicalLevel = levelFromLawStatus(profile.medical ?? "illegal");
  const recreationalLevel = levelFromLawStatus(profile.recreational ?? "illegal");
  const legalSsot = profile.legal_ssot;
  const machineVerifiedEntry = profile.machine_verified ?? profile.auto_verified;
  const legalSources = Array.isArray(legalSsot?.sources) ? legalSsot?.sources : [];
  const legalOfficialSources = Array.isArray(profile.official_sources)
    ? profile.official_sources
    : [];
  const legalWikiSource =
    typeof profile.wiki_source === "string" ? profile.wiki_source : null;
  const wikiClaim = profile.wiki_claim ?? null;
  const wikiClaimLink =
    wikiClaim && typeof wikiClaim.wiki_row_url === "string"
      ? wikiClaim.wiki_row_url
      : null;
  const wikiClaimUrl = wikiClaimLink || legalWikiSource;
  const wikiClaimRecreational = wikiClaim?.recreational_status || "Unknown";
  const wikiClaimMedical = wikiClaim?.medical_status || "Unknown";
  const wikiClaimArticles = Array.isArray(wikiClaim?.notes_main_articles)
    ? wikiClaim.notes_main_articles
    : [];
  const wikiNotesText =
    typeof wikiClaim?.notes_text === "string" ? wikiClaim.notes_text : "";
  const wikiNotesSections = Array.isArray(wikiClaim?.notes_sections_used)
    ? wikiClaim.notes_sections_used
    : [];
  const wikiNotesMainArticle =
    typeof wikiClaim?.notes_main_article === "string"
      ? wikiClaim.notes_main_article
      : "";
  const wikiNotesRev =
    typeof wikiClaim?.notes_rev === "string" ? wikiClaim.notes_rev : "";
  const wikiLinksSafe = Array.isArray(wikiLinks) ? wikiLinks : [];
  const wikiTrustTotal =
    Number(linksTrustSafe?.total_count || 0) || wikiLinksSafe.length;
  const wikiTrustNonOfficial = Math.max(wikiTrustTotal - wikiTrustOfficial, 0);
  const showWikiTrust = wikiTrustTotal > 0 || wikiTrustOfficial > 0;
  const wikiTrustLabel =
    wikiTrustOfficial > 0
      ? `Wiki sources: official=${wikiTrustOfficial} non_official=${wikiTrustNonOfficial}`
      : "ссылки не с официальных ресурсов";
  const ssotSnapshotPath = (() => {
    const candidate = (legalSsot as { snapshot_path?: unknown } | null)?.snapshot_path;
    return typeof candidate === "string" ? candidate : null;
  })();
  const ssotFetchedAt = (() => {
    const candidate = (legalSsot as { fetched_at?: unknown } | null)?.fetched_at;
    return typeof candidate === "string" ? candidate : null;
  })();
  const ssotSnapshotDate =
    (ssotSnapshotPath && ssotSnapshotPath.match(/\/(\d{4}-\d{2}-\d{2})\//)?.[1]) ||
    (ssotFetchedAt ? ssotFetchedAt.slice(0, 10) : null) ||
    (typeof legalSsot?.generated_at === "string"
      ? legalSsot.generated_at
      : typeof legalSsot?.generatedAt === "string"
        ? legalSsot.generatedAt
        : null);
  const machineVerifiedEvidence = Array.isArray(machineVerifiedEntry?.evidence)
    ? machineVerifiedEntry?.evidence
    : [];
  const machineVerifiedEvidenceCount = machineVerifiedEvidence.length;
  const machineVerifiedEvidenceKind =
    machineVerifiedEntry &&
    (machineVerifiedEntry as { evidence_kind?: string }).evidence_kind === "law"
      ? "law"
      : "non_law";
  const machineVerifiedSourceUrl =
    typeof machineVerifiedEntry?.source_url === "string"
      ? machineVerifiedEntry.source_url
      : null;
  const machineVerifiedSnapshotPath =
    typeof machineVerifiedEntry?.snapshot_path === "string"
      ? machineVerifiedEntry.snapshot_path
      : null;
  const machineVerifiedSnapshotDate =
    (machineVerifiedSnapshotPath &&
      machineVerifiedSnapshotPath.match(/\/(\d{4}-\d{2}-\d{2})\//)?.[1]) ||
    (typeof machineVerifiedEntry?.retrieved_at === "string"
      ? machineVerifiedEntry.retrieved_at
      : null);
  const machineVerifiedAt =
    typeof machineVerifiedEntry?.retrieved_at === "string"
      ? machineVerifiedEntry.retrieved_at
      : typeof (machineVerifiedEntry as { verified_at?: string })?.verified_at ===
        "string"
        ? (machineVerifiedEntry as { verified_at?: string }).verified_at
        : null;
  const nowIso =
    typeof resolvedViewModel.meta?.nowIso === "string"
      ? resolvedViewModel.meta.nowIso
      : null;
  const verifyReason =
    typeof resolvedViewModel.meta?.verifyReason === "string"
      ? resolvedViewModel.meta.verifyReason
      : null;
  const machineVerifiedBadge =
    machineVerifiedEvidenceCount > 0 &&
    Boolean(machineVerifiedEntry?.official_source_ok) &&
    machineVerifiedEvidenceKind === "law";
  const verifyLinksLabel = machineVerifiedBadge
    ? "Verify links"
    : "Sources (unverified)";
  const machineVerifiedSourceLink = machineVerifiedSourceUrl
    ? { title: "Official source", url: machineVerifiedSourceUrl }
    : null;
  const legalOfficialLinks = legalOfficialSources.map((url) => ({
    title: "Official source",
    url
  }));
  const legalSourceLinks = legalSources.map((source) =>
    typeof source === "string"
      ? { title: "Official source", url: source }
      : { title: source.title ?? "Official source", url: source.url }
  );
  const officialVerifySources = [
    ...officialSources,
    ...legalSourceLinks,
    ...legalOfficialLinks,
    ...(machineVerifiedSourceLink ? [machineVerifiedSourceLink] : [])
  ].filter((source, index, list) => {
    if (!source?.url) return false;
    return list.findIndex((candidate) => candidate.url === source.url) === index;
  });
  const legalVerifyLinks = legalSources.length
    ? legalSources
    : [
        ...legalOfficialLinks,
        ...(legalWikiSource
          ? [{ title: "Wikipedia: Legality of cannabis", url: legalWikiSource }]
          : [])
      ];
  const offlineFallbackSources = Array.isArray(resolvedViewModel.meta?.offlineFallbackSources)
    ? resolvedViewModel.meta?.offlineFallbackSources
    : [];
  const combinedVerifyLinks = [
    ...verifyLinks,
    ...(machineVerifiedSourceLink ? [machineVerifiedSourceLink] : []),
    ...legalVerifyLinks,
    ...offlineFallbackSources
  ].filter(
    (source, index, list) => {
      if (!source?.url) return false;
      return list.findIndex((candidate) => candidate.url === source.url) === index;
    }
  );
  const showVerifyLinks = combinedVerifyLinks.length > 0;
  const evidenceLinks = Array.isArray(machineVerifiedEvidence)
    ? machineVerifiedEvidence
        .filter((item) => item && typeof item === "object")
        .map((item) => {
          const record = item as {
            type?: string;
            page?: string | null;
            anchor?: string | null;
            kind?: string;
            ref?: string;
            quote?: string;
          };
          const kind = record.type || record.kind || "html_anchor";
          const ref =
            kind === "pdf_page"
              ? record.page || record.ref || ""
              : record.anchor || record.ref || "";
          const quote = typeof record.quote === "string" ? record.quote : "";
          return { kind, ref, quote };
        })
        .filter((item) => item.ref)
    : [];
  const showEvidenceLinks =
    machineVerifiedEvidenceKind === "law" &&
    Boolean(machineVerifiedSourceUrl) &&
    evidenceLinks.length > 0;
  const ssotChanged = Boolean(resolvedViewModel.meta?.ssotChanged);
  const offlineFallback = Boolean(resolvedViewModel.meta?.offlineFallback);
  const offlineNote = resolvedViewModel.meta?.offlineFallbackNote;
  if (
    process.env.NODE_ENV !== "production" &&
    Array.isArray(profile.sources) &&
    profile.sources.length >
      officialSources.length + neutralSources.length
  ) {
    console.warn(
      `UI_RESULTCARD_INVALID_SOURCES total=${profile.sources.length} valid=${officialSources.length + neutralSources.length}`
    );
  }

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
          {showPagesMetrics ? (
            <div className={styles.metaLabel} data-testid="pages-metrics">
              Pages: OK {pagesOkValue} / Total {pagesTotalValue}
              {pagesOkValue < pagesTotalValue ? " (some failed)" : ""}
            </div>
          ) : null}
        </div>
      </header>

      <section className={styles.section}>
        <h2>Status</h2>
        <div
          className={styles.metaLabel}
          data-testid="result-level"
          data-level={displayLevel}
        >
          {resultIcon} {displayTitle}
        </div>
        <div className={styles.metaLabel} data-testid="medical-breakdown">
          Medical: {profile.medical ?? "unknown"}
        </div>
        <div className={styles.metaLabel} data-testid="recreational-breakdown">
          Recreational: {profile.recreational ?? "unknown"}
        </div>
        {legalSsot || profile.status_recreational || profile.status_medical ? (
          <div className={styles.metaLabel} data-testid="legal-status">
            <div>
              Recreational:{" "}
              {legalSsot?.recreational ?? profile.status_recreational}
            </div>
            <div>Medical: {legalSsot?.medical ?? profile.status_medical}</div>
            {legalVerifyLinks.length > 0 ? (
              <div>
                Sources:{" "}
                {legalVerifyLinks.slice(0, 2).map((source, index) => (
                  <span key={source.url}>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.title}
                    </a>
                    {index === 0 && legalVerifyLinks.length > 1 ? ", " : ""}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {locationMethod ? (
          <div className={styles.metaLabel} data-testid="location-method">
            Location: {locationMethod}
            {locationConfidence ? (
              <>
                {" "}
                · Confidence: {confidenceLabel(locationConfidence)}
              </>
            ) : null}
          </div>
        ) : null}
        <StatusBadge
          level={resolvedViewModel.statusLevel}
          label={resolvedViewModel.statusTitle}
        />
        {visibleWhyBullets.length > 0 ? (
          <ul className={styles.bullets} data-testid="why-bullets">
            {visibleWhyBullets.map((bullet, index) => (
              <li key={`${bullet}-${index}`}>{bullet}</li>
            ))}
          </ul>
        ) : null}
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
              {nearestLegal && resolvedViewModel.statusLevel !== "green" ? (
                <p data-testid="nearest-legal">
                  Nearest legal area:{" "}
                  {isPaidUser
                    ? `${nearestLegal.jurisdictionKey} (~${Math.round(
                        nearestLegal.distanceKm
                      )} km)`
                    : "preview"}
                </p>
              ) : null}
              {nearestLegal &&
              resolvedViewModel.statusLevel !== "green" &&
              !isPaidUser ? (
                <p className={styles.warningDisclaimer}>Unlock details</p>
              ) : null}
            </div>
          </div>
          <p className={styles.warningDisclaimer}>
            Approximate. Verify local rules.
          </p>
        </section>
      ) : null}

      {showNearby ? (
        <NearbyPaidSection nearby={nearby} isPaidUser={isPaidUser} />
      ) : null}

      {showPaidPreview ? (
        <section className={styles.section} data-testid="paid-preview">
          <h2>Preview (paid)</h2>
        </section>
      ) : null}

      {paidExtrasEnabled && !isPro ? (
        <section className={styles.section} data-testid="advanced-teaser">
          <h2>Advanced details (extras + nearest legal area) — Pro</h2>
          {proPreviewHref ? (
            <Link className={styles.sourceButton} href={proPreviewHref}>
              Preview
            </Link>
          ) : null}
        </section>
      ) : null}

      {paidExtrasEnabled && isPro ? (
        <section className={styles.section} data-testid="advanced">
          <h2>Advanced</h2>
          <div className={styles.metaLabel}>
            Medical use: {levelIcon(medicalLevel)} {levelLabel(medicalLevel)}
          </div>
          <div className={styles.metaLabel}>
            Recreational use: {levelIcon(recreationalLevel)}{" "}
            {levelLabel(recreationalLevel)}
          </div>
          <ul className={styles.bullets}>
            {advancedExtras.map((item) => (
              <li key={item.key}>
                <strong>{item.title}:</strong> {item.why}
              </li>
            ))}
          </ul>
          {advancedNearest ? (
            <p className={styles.updated} data-testid="advanced-nearest">
              Nearest legal/restricted border: {advancedNearest.name} (
              {advancedNearest.id}) · {levelLabel(advancedNearest.level)} ·{" "}
              {Math.round(advancedNearest.distanceKm)} km · sources{" "}
              {advancedNearest.sourcesCount}
            </p>
          ) : null}
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

          <section className={styles.section} data-testid="verify-yourself">
            <h3>Verify yourself</h3>
            {machineVerifiedBadge ? (
              <p className={styles.provisionalBanner} data-testid="auto-verified-badge">
                Machine verified
              </p>
            ) : profile.status === "needs_review" ? (
              <p className={styles.provisionalBanner} data-testid="candidate-badge">
                Candidate (unreviewed)
              </p>
            ) : legalSsot ? (
              <p
                className={styles.provisionalBanner}
                data-testid="candidate-uncertain-badge"
              >
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
                    <a
                      className={styles.sourceLink}
                      href={article.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className={styles.sourceTitle}>
                        {article.title || "Main article"}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
            {wikiClaim ? (
              <div className={styles.updated} data-testid="wiki-notes">
                <div>
                  {wikiNotesText ? "Notes" : "Notes (placeholder)"}
                  {wikiNotesRev ? ` · from wiki rev=${wikiNotesRev}` : ""}
                  {wikiNotesMainArticle ? ` · source=${wikiNotesMainArticle}` : ""}
                </div>
                {wikiNotesSections.length > 0 ? (
                  <div>Sections: {wikiNotesSections.join(", ")}</div>
                ) : null}
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
            {!machineVerifiedEntry && !ssotSnapshotDate ? (
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
            <VerifyNowButton
              iso={profile.id}
              verifiedAt={machineVerifiedAt}
              nowIso={nowIso}
            />
            {showEvidenceLinks ? (
              <>
                <p className={styles.updated}>{verifyLinksLabel}</p>
                <ul className={styles.sources} data-testid="verify-evidence-links">
                  {evidenceLinks.slice(0, 3).map((item, index) => (
                    <li
                      key={`${item.ref}-${index}`}
                      className={styles.sourceItem}
                    >
                      <a
                        className={styles.sourceLink}
                        href={machineVerifiedSourceUrl ?? ""}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span className={styles.sourceTitle}>
                          Official source
                        </span>
                        <span className={styles.sourceHost}>
                          Snapshot {machineVerifiedSnapshotDate ?? "n/a"} ·{" "}
                          {item.kind === "pdf_page" ? "Page" : "Anchor"}:{" "}
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
                    <a
                      className={styles.sourceLink}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                    >
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
                      <a
                        className={styles.sourceLink}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                      >
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
                      <a
                        className={styles.sourceLink}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span className={styles.sourceTitle}>{source.title}</span>
                        <span className={styles.sourceHost}>
                          {(() => {
                            try {
                              return new URL(source.url).hostname;
                            } catch {
                              return "";
                            }
                          })()}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
                {limitedFacts.length > 0 ? (
                  <ul className={styles.sources} data-testid="verify-facts">
                    {limitedFacts.map((fact, index) => (
                      <li key={`${fact.url}-${index}`} className={styles.sourceItem}>
                        <span className={styles.sourceTitle}>
                          {fact.category}
                        </span>
                        {fact.effective_date ? (
                          <span className={styles.sourceHost}>
                            {fact.effective_date}
                          </span>
                        ) : null}
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
            {profile.updated_at ? (
              <p className={styles.updated} data-testid="updated-at">
                Last updated: {profile.updated_at}
              </p>
            ) : null}
            {!showVerifyLinks &&
            (profile.status === "provisional" || profile.status === "needs_review") ? (
              <p className={styles.provisionalBanner}>
                {profile.status === "provisional"
                  ? "Provisional"
                  : "Needs review"}
              </p>
            ) : null}
          </section>

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
        <section className={styles.section} data-testid="extras-preview">
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
          {isPaidUser ? null : (
            <p className={styles.extrasLock}>Unlock details</p>
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
