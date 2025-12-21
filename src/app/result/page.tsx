import Link from "next/link";
import { computeStatus, getLawProfile } from "@/lib/lawStore";
import type { RiskFlag } from "@/lib/types";
import styles from "./result.module.css";

type SearchParams = { country?: string; region?: string };

const statusLabels: Record<string, string> = {
  recreational_legal: "Recreational legal",
  medical_only_or_restricted: "Medical only or restricted",
  illegal_or_highly_restricted: "Illegal or highly restricted"
};

const riskText: Record<RiskFlag, string> = {
  border_crossing: "Crossing borders with cannabis is illegal.",
  public_use: "Public use can lead to citations or criminal penalties.",
  driving: "Driving with cannabis can trigger DUI enforcement.",
  federal_property_us: "Federal property has separate enforcement rules."
};

function formatStatus(value: string | undefined) {
  if (!value) return "Not specified";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function ResultPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const rawCountry = (sp.country ?? "").trim().toUpperCase();
  const rawRegion = (sp.region ?? "").trim().toUpperCase();

  const country = rawCountry || "US";
  const region = rawRegion || "CA";

  const profile = getLawProfile({
    country,
    region: country === "US" ? region : undefined
  });

  if (!profile) {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <div className={styles.card}>
            <h1>Result</h1>
            <p>We could not find that jurisdiction.</p>
            <Link className={styles.backLink} href="/">
              Return to search
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const computedStatus = computeStatus(profile);
  const statusLabel = statusLabels[computedStatus] ?? computedStatus;

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
              <p className={styles.kicker}>Result card</p>
              <h1>{profile.id}</h1>
            </div>
            <span className={styles.status}>{statusLabel}</span>
          </header>

          <section className={styles.section}>
            <h2>What it means today</h2>
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
