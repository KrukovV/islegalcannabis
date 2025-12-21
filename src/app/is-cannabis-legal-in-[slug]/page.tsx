import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLawProfile } from "@/lib/lawStore";
import { computeStatus } from "@/lib/status";
import type { RiskFlag } from "@/lib/types";
import { slugMap } from "@/lib/seo/slugMap";
import styles from "./seo.module.css";

export const runtime = "nodejs";

const riskText: Record<RiskFlag, string> = {
  border_crossing: "Crossing borders with cannabis is illegal.",
  public_use: "Public use can lead to citations or criminal penalties.",
  driving: "Driving with cannabis can trigger DUI enforcement.",
  federal_property_us: "Federal property has separate enforcement rules."
};

const statusIcon: Record<string, string> = {
  green: "✅",
  yellow: "⚠️",
  red: "⛔"
};

const countryFlag: Record<string, string> = {
  US: "🇺🇸",
  DE: "🇩🇪"
};

function formatStatus(value: string | undefined) {
  if (!value) return "Not specified";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function generateStaticParams() {
  return Object.keys(slugMap).map((slug) => ({ slug }));
}

export function generateMetadata({
  params
}: {
  params: { slug: string };
}): Metadata {
  const entry = slugMap[params.slug];
  if (!entry) {
    return { title: "Jurisdiction not found" };
  }

  const title = `Is cannabis legal in ${entry.displayName}?`;
  const description =
    "Educational summary of local cannabis laws. Not legal advice.";

  return { title, description };
}

export default function SeoResultPage({
  params
}: {
  params: { slug: string };
}) {
  const entry = slugMap[params.slug];
  if (!entry) notFound();

  const profile = getLawProfile({
    country: entry.country,
    region: entry.region
  });

  if (!profile) notFound();

  const status = computeStatus(profile);
  const flag = countryFlag[profile.country] ?? "🏳️";

  const bullets = [
    { label: "Medical", value: formatStatus(profile.medical) },
    { label: "Recreational", value: formatStatus(profile.recreational) },
    {
      label: "Possession limit",
      value: profile.possession_limit ?? "Not specified"
    },
    { label: "Public use", value: formatStatus(profile.public_use) },
    { label: "Home grow", value: formatStatus(profile.home_grow) },
    { label: "Cross-border", value: formatStatus(profile.cross_border) }
  ];

  const risks =
    profile.risks.length > 0
      ? profile.risks.map((risk) => riskText[risk] ?? risk)
      : ["No key risks flagged in this summary."];

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.card}>
          <header className={styles.header}>
            <div>
              <p className={styles.kicker}>Educational summary</p>
              <h1>
                Is cannabis legal in {entry.displayName}?
              </h1>
              <p className={styles.jurisdiction}>
                <span className={styles.flag}>{flag}</span>
                {profile.id}
              </p>
            </div>
            <div className={`${styles.statusBadge} ${styles[status.level]}`}>
              <span className={styles.statusIcon}>
                {statusIcon[status.level]}
              </span>
              <span>{status.label}</span>
            </div>
          </header>

          <section className={styles.section}>
            <h2>Details</h2>
            <ul className={styles.bullets}>
              {bullets.map((item) => (
                <li key={item.label}>
                  <span>{item.label}:</span> {item.value}
                </li>
              ))}
            </ul>
          </section>

          <section className={styles.section}>
            <h2>Key risks</h2>
            <ul className={styles.risks}>
              {risks.map((risk) => (
                <li key={risk}>{risk}</li>
              ))}
            </ul>
          </section>

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

          <div className={styles.disclaimer}>
            Educational only. Not legal advice. Laws change.
          </div>
        </div>
      </div>
    </main>
  );
}
