import Link from "next/link";
import { getLawProfile } from "@/lib/lawStore";
import ResultCard from "@/components/ResultCard";
import SimpleTermsClient from "@/components/SimpleTermsClient";
import { buildExplanationInput } from "@/lib/explanation";
import { buildFallbackText } from "@/lib/ai/paraphrase";
import { logEvent } from "@/lib/analytics";
import styles from "./result.module.css";
import type { LocationMethod, LocationResolution } from "@islegal/shared";
import { confidenceForLocation } from "@/lib/geo/locationResolution";

export const runtime = "nodejs";

type SearchParams = {
  country?: string;
  region?: string;
  method?: string;
  confidence?: string;
  locNote?: string;
};

function parseLocationMethod(value?: string): LocationMethod {
  if (value === "gps" || value === "ip" || value === "manual") {
    return value;
  }
  return "manual";
}

function parseConfidence(value?: string) {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }
  return null;
}

export default async function ResultPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const rawCountry = (sp.country ?? "").trim().toUpperCase();
  const rawRegion = (sp.region ?? "").trim().toUpperCase();
  const method = parseLocationMethod(sp.method);
  const confidence = parseConfidence(sp.confidence);
  const locNote = sp.locNote;

  const country = rawCountry || "US";
  const region = rawRegion || "CA";
  const locationResolution: LocationResolution = {
    method,
    confidence: confidence ?? confidenceForLocation(method, region),
    ...(locNote ? { note: locNote } : {})
  };

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

  logEvent("check_performed");
  const { status, bullets, risksText } = buildExplanationInput(profile);
  const fallbackText = buildFallbackText({
    profile,
    status,
    bullets,
    risksText,
    locale: "en"
  });

  const isPaidUser = false;

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <ResultCard
          profile={profile}
          title={profile.id}
          locationResolution={locationResolution}
          isPaidUser={isPaidUser}
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
