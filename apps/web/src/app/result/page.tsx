import Link from "next/link";
import { getLawProfile } from "@/lib/lawStore";
import ResultCard from "@/components/ResultCard";
import SimpleTermsClient from "@/components/SimpleTermsClient";
import { buildExplanationInput } from "@/lib/explanation";
import { buildFallbackText } from "@/lib/ai/paraphrase";
import styles from "./result.module.css";

export const runtime = "nodejs";

type SearchParams = { country?: string; region?: string };

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

  const { status, bullets, risksText } = buildExplanationInput(profile);
  const fallbackText = buildFallbackText({
    profile,
    status,
    bullets,
    risksText,
    locale: "en"
  });

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <ResultCard
          profile={profile}
          title={profile.id}
          simpleTerms={
            <SimpleTermsClient
              country={country}
              region={country === "US" ? region : undefined}
              fallbackText={fallbackText}
            />
          }
        />
      </div>
    </main>
  );
}
