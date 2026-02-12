import Link from "next/link";
import CheckErrorCard from "@/components/CheckErrorCard";
import { GET as checkGET } from "../api/check/route";
import { fromDetected, fromManual, fromQuery } from "@/lib/location/locationContext";
import { mapCheckError } from "@/lib/ui/checkErrors";
import styles from "../result/result.module.css";
import LocationMeta from "@/components/LocationMeta";
import { buildRegions, buildSSOTStatusIndex } from "@/lib/mapData";
import { SSOTStatusText, statusTruthBadge } from "@/lib/statusUi";
import { explainSSOT } from "@/lib/ssotExplain";

export const runtime = "nodejs";

type SP = {
  country?: string;
  region?: string;
  method?: string;
  confidence?: string;
  paid?: string;
  pro?: string;
};

export default async function CheckPage({
  searchParams
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;

  const rawCountry = (sp.country ?? "US").trim().toUpperCase();
  const rawRegion = (sp.region ?? "CA").trim().toUpperCase();
  const country = rawCountry || "US";
  const region = rawRegion || "CA";
  const params = new URLSearchParams();
  params.set("country", country);
  if (country === "US") {
    params.set("region", region);
  }
  if (sp.method) params.set("method", sp.method);
  if (sp.confidence) params.set("confidence", sp.confidence);
  if (sp.paid) params.set("paid", sp.paid);
  if (sp.pro) params.set("pro", sp.pro);
  const isPro = sp.pro === "1";
  const proParams = new URLSearchParams(params.toString());
  proParams.set("pro", "1");
  const proPreviewHref = `/check?${proParams.toString()}`;

  const url = new URL("http://localhost/api/check");
  url.search = params.toString();
  const res = await checkGET(new Request(url.toString()));
  const json = await res.json();
  const retryHref = `/check?${params.toString()}`;

  if (!json.ok) {
    const mapped = mapCheckError(json?.error?.code);
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <CheckErrorCard
            title={mapped.title}
            message={mapped.message}
            requestId={json.requestId}
            retryHref={retryHref}
          />
        </div>
      </main>
    );
  }

  if (!json.profile) {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <CheckErrorCard
            title="Data not available"
            message="We do not have data for that jurisdiction yet. Choose another location."
            requestId={json.requestId}
            retryHref={retryHref}
          />
        </div>
      </main>
    );
  }

  const geoKey = country === "US" ? `US-${region}` : country;
  const regions = buildRegions();
  const statusIndex = buildSSOTStatusIndex(regions);
  const entry = statusIndex.get(geoKey);
  if (!entry) {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <CheckErrorCard
            title="Data not available"
            message="We do not have SSOT data for that jurisdiction yet. Choose another location."
            requestId={json.requestId}
            retryHref={retryHref}
          />
        </div>
      </main>
    );
  }

  const locationMode = json.viewModel?.location?.mode ?? "query";
  const method = json.viewModel?.location?.method;
  const confidence = json.viewModel?.location?.confidence;
  const locationContext =
    locationMode === "manual"
      ? fromManual(country, country === "US" ? region : undefined)
      : locationMode === "detected" && method && confidence
        ? fromDetected({
            country,
            region: country === "US" ? region : undefined,
            method,
            confidence
          })
        : fromQuery({
            country,
            region: country === "US" ? region : undefined
          });

  const truthLevel = entry.truthLevel ?? "WIKI_ONLY";
  const truthLevelLabel = truthLevel;
  const truthReasonCodes = Array.isArray(entry.reasons) ? entry.reasons : [];
  const hasOfficialOverride = Boolean(entry.officialOverride);
  const effectiveRec = entry.recDerived || entry.recEffective || "Unknown";
  const effectiveMed = entry.medDerived || entry.medEffective || "Unknown";
  const wikiUsed = Boolean(entry.wikiPage);
  const officialCount = Number.isFinite(entry.officialLinksCount)
    ? entry.officialLinksCount
    : 0;
  const verifyLinks = Array.isArray(json.verify_links) ? json.verify_links : [];
  const wikiLinks = Array.isArray(json.wiki_links) ? json.wiki_links : [];
  const explain = explainSSOT({
    truthLevel,
    officialLinksCount: officialCount,
    recEffective: effectiveRec,
    medEffective: effectiveMed,
    reasons: truthReasonCodes
  });
  const truthBadge = statusTruthBadge(truthLevel);
  const ssotText = SSOTStatusText({
    truthLevel,
    recEffective: effectiveRec,
    medEffective: effectiveMed
  });

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.card}>
          <header className={styles.header}>
            <div>
              <div className={styles.kicker}>SSOT check</div>
              <h1 className={styles.title}>
                {json.viewModel?.title ?? geoKey}
              </h1>
            </div>
            <div className={styles.meta}>
              <LocationMeta context={locationContext} />
            </div>
          </header>
          <section className={styles.section}>
            <h2>Status</h2>
            <div className={styles.metaLabel} data-testid="legal-status">
              <div>
                Вывод: Recreational — {explain.recStatusRu}; Medical — {explain.medStatusRu}
              </div>
              <div>
                Основано на: {explain.basisText} · {truthBadge.icon} {truthBadge.label}
              </div>
            </div>
            <div className={styles.metaLabel}>
              Recreational: Статус (по данным): {explain.recStatusRu}
            </div>
            <div className={styles.metaLabel}>
              Уверенность: {explain.reliabilityText}
            </div>
            <div className={styles.metaLabel}>
              Medical: Статус (по данным): {explain.medStatusRu}
            </div>
            <div className={styles.metaLabel}>Уверенность: {explain.reliabilityText}</div>
            <div className={styles.metaLabel}>Почему: {explain.whyText}</div>
            {explain.nextStepText ? (
              <div className={styles.metaLabel}>{explain.nextStepText}</div>
            ) : null}
            <details className={styles.metaLabel}>
              <summary>Details (для продвинутых)</summary>
              <div>Status source: SSOT_ONLY</div>
              <div>
                SSOT truth level: {truthLevelLabel} ({truthLevel})
              </div>
              <div>Official override: {hasOfficialOverride ? "YES" : "NO"}</div>
              <div>
                Wiki used: {wikiUsed ? "YES (source material only)" : "NO"}
              </div>
              <div>Official links: {officialCount}</div>
              {truthReasonCodes.length > 0 ? (
                <div>Truth reasons: {truthReasonCodes.join(", ")}</div>
              ) : (
                <div>Truth reasons: -</div>
              )}
              <div>{ssotText.recText}</div>
              <div>{ssotText.medText}</div>
            </details>
          </section>
          <section className={styles.section}>
            <h2 data-testid="verify-yourself">Verify yourself</h2>
            {verifyLinks.length > 0 ? (
              <ul className={styles.sources} data-testid="verify-links">
                {verifyLinks.map((link: { title?: string; url?: string }) => (
                  <li key={link.url ?? link.title}>
                    {link.url ? (
                      <a href={link.url} target="_blank" rel="noreferrer">
                        {link.title ?? "Official source"}
                      </a>
                    ) : (
                      link.title ?? "Official source"
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
            {wikiLinks.length > 0 ? (
              <ul className={styles.sources} data-testid="verify-sources">
                {wikiLinks.map((link: { title?: string; url?: string }) => (
                  <li key={link.url ?? link.title}>
                    {link.url ? (
                      <a href={link.url} target="_blank" rel="noreferrer">
                        {link.title ?? link.url}
                      </a>
                    ) : (
                      link.title ?? "Wikipedia: Legality of cannabis"
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
            <details className={styles.metaLabel}>
              <summary>Details (для продвинутых)</summary>
              <ul className={styles.sources} data-testid="verify-facts">
                <li>facts: ssot_only</li>
              </ul>
            </details>
          </section>
          {isPro ? (
            <div className={styles.metaLabel}>
              Pro preview: <Link href={proPreviewHref}>open</Link>
            </div>
          ) : null}
        </div>
        <Link className={styles.backLink} href="/">
          Back to location search
        </Link>
      </div>
    </main>
  );
}
