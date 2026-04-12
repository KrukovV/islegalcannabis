import type {
  JurisdictionLawProfile,
  ResultStatusLevel,
  ResultViewModel
} from "@islegal/shared";
import {
  extrasFromProfile,
  normalizeSourceList,
  STATUS_BANNERS
} from "@islegal/shared";
import type { LocationContext } from "@/lib/location/locationContext";
import type { ReactNode } from "react";
import Disclaimer from "./Disclaimer";
import styles from "./ResultCard.module.css";
import UpgradePrompt from "./UpgradePrompt";
import LocationMeta from "@/components/LocationMeta";
import NearbyPaidSection from "@/components/NearbyPaidSection";
import RecentResultBadge from "@/components/RecentResultBadge";
import ResultCardVerifySection from "@/components/ResultCardVerifySection";
import { hashLawProfile } from "@/lib/profileHash";
import { buildTripStatusCode } from "@/lib/tripStatus";
import { buildResultViewModel } from "@/lib/resultViewModel";
import { buildExtrasCards, statusIconForExtras } from "@/lib/extras";
import Link from "next/link";
import { shouldHighlightManualAction } from "@/lib/geo/locationResolution";
import { toLocationResolution } from "@/lib/location/locationContext";
import { FEATURES } from "@/lib/features";
import StatusPanel from "./StatusPanel";

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
  showSources: _showSources,
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
  const profileHash = hashLawProfile(profile);
  const flag = countryFlag[profile.country] ?? "🏳️";

  const bullets = resolvedViewModel.bullets;
  const bulletLimit = maxBullets ?? (isPaidUser ? bullets.length : 3);
  const visibleBullets = bullets.slice(0, bulletLimit);
  const risks = resolvedViewModel.keyRisks;
  const renderRisks = showRisks ?? isPaidUser;
  const renderPdf = showPdf ?? isPaidUser;
  const renderUpgrade = showUpgradePrompt ?? !isPaidUser;
  const verifiedLabel = resolvedViewModel.verifiedAt ?? "Not verified";
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
  const displayMedicalStatus = legalSsot?.medical ?? profile.medical ?? "unknown";
  const displayRecreationalStatus = legalSsot?.recreational ?? profile.recreational ?? "unknown";
  const displayDistributionStatus = legalSsot?.distribution ?? null;
  const machineVerifiedEntry = profile.machine_verified ?? profile.auto_verified;
  const legalSources = Array.isArray(legalSsot?.sources) ? legalSsot?.sources : [];
  const legalOfficialSources = Array.isArray(profile.official_sources)
    ? profile.official_sources
    : [];
  const legalWikiSource =
    typeof profile.wiki_source === "string" ? profile.wiki_source : null;
  const wikiClaim = (profile.wiki_claim ?? null) as
    | ({
        wiki_row_url?: string;
        recreational_status?: string;
        medical_status?: string;
        notes_main_articles?: unknown[];
        notes_text?: string;
        notes_sections_used?: unknown[];
        notes_main_article?: string;
        notes_rev?: string;
      } & Record<string, unknown>)
    | null;
  const wikiClaimLink =
    wikiClaim && typeof wikiClaim.wiki_row_url === "string"
      ? wikiClaim.wiki_row_url
      : null;
  const wikiClaimUrl = wikiClaimLink || legalWikiSource;
  const wikiClaimRecreational = wikiClaim?.recreational_status || "Unknown";
  const wikiClaimMedical = wikiClaim?.medical_status || "Unknown";
  const wikiClaimArticles = Array.isArray(wikiClaim?.notes_main_articles)
    ? (wikiClaim.notes_main_articles as Array<{ url?: string; title?: string }>)
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

      <StatusPanel
        statusLevel={resolvedViewModel.statusLevel}
        statusTitle={resolvedViewModel.statusTitle}
        panel={resolvedViewModel.statusPanel}
      />

      {(locationMethod || legalSsot || profile.status_recreational || profile.status_medical) ? (
        <section className={styles.section}>
          <h2>Legal breakdown</h2>
          <div className={styles.metaLabel} data-testid="medical-breakdown">
            Medical: {displayMedicalStatus}
          </div>
          <div className={styles.metaLabel} data-testid="recreational-breakdown">
            Recreational: {displayRecreationalStatus}
          </div>
          {legalSsot || profile.status_recreational || profile.status_medical ? (
            <div className={styles.metaLabel} data-testid="legal-status">
              <div>
                Recreational:{" "}
                {legalSsot?.recreational ?? profile.status_recreational}
              </div>
              <div>Medical: {legalSsot?.medical ?? profile.status_medical}</div>
              {displayDistributionStatus ? <div>Distribution: {displayDistributionStatus}</div> : null}
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
      ) : null}

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

      {renderRisks || renderPdf || showExtrasCards ? (
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

          <ResultCardVerifySection
            machineVerifiedBadge={machineVerifiedBadge}
            profileStatus={profile.status}
            legalSsotPresent={Boolean(legalSsot)}
            wikiClaimUrl={wikiClaimUrl}
            wikiClaimRecreational={wikiClaimRecreational}
            wikiClaimMedical={wikiClaimMedical}
            wikiClaimArticles={wikiClaimArticles}
            wikiClaimPresent={Boolean(wikiClaim)}
            wikiNotesText={wikiNotesText}
            wikiNotesRev={wikiNotesRev}
            wikiNotesMainArticle={wikiNotesMainArticle}
            wikiNotesSections={wikiNotesSections}
            showWikiTrust={showWikiTrust}
            wikiTrustLabel={wikiTrustLabel}
            ssotChanged={ssotChanged}
            machineVerifiedEntryPresent={Boolean(machineVerifiedEntry)}
            ssotSnapshotDate={ssotSnapshotDate}
            verifyReason={verifyReason}
            offlineFallback={offlineFallback}
            offlineNote={offlineNote}
            profileId={profile.id}
            machineVerifiedAt={machineVerifiedAt ?? null}
            nowIso={nowIso ?? null}
            showEvidenceLinks={showEvidenceLinks}
            evidenceLinks={evidenceLinks}
            machineVerifiedSourceUrl={machineVerifiedSourceUrl}
            machineVerifiedSnapshotDate={machineVerifiedSnapshotDate}
            verifyLinksLabel={verifyLinksLabel}
            ssotOfficialLinks={ssotOfficialLinks}
            officialVerifySources={officialVerifySources}
            showVerifyLinks={showVerifyLinks}
            combinedVerifyLinks={combinedVerifyLinks}
            limitedFacts={limitedFacts}
            profileUpdatedAt={profile.updated_at ?? null}
          />

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
