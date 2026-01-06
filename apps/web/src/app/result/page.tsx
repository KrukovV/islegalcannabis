import Link from "next/link";
import { getLawProfile } from "@/lib/lawStore";
import ResultCard from "@/components/ResultCard";
import SimpleTermsClient from "@/components/SimpleTermsClient";
import { buildExplanationInput } from "@/lib/explanation";
import { buildFallbackText } from "@/lib/ai/paraphrase";
import { logEvent } from "@/lib/analytics";
import styles from "./result.module.css";
import type { LocationMethod } from "@islegal/shared";
import { confidenceForLocation } from "@/lib/geo/locationResolution";
import { computeStatus } from "@islegal/shared";
import { buildTripStatusCode } from "@/lib/tripStatus";
import TripEventLogger from "./TripEventLogger";
import {
  fromDetected,
  fromManual,
  fromQuery,
  type LocationContext
} from "@/lib/location/locationContext";
import { titleForJurisdiction } from "@/lib/jurisdictionTitle";
import { buildResultViewModel } from "@/lib/resultViewModel";

export const runtime = "nodejs";

type SearchParams = {
  country?: string;
  region?: string;
  method?: string;
  confidence?: string;
  locNote?: string;
  cell?: string;
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
  const cacheCell = sp.cell ?? null;
  const country = rawCountry || "US";
  const region = rawRegion || "CA";
  const regionValue = country === "US" ? region : undefined;
  const normalizedConfidence = confidence ?? confidenceForLocation(method, region);
  const locationContext: LocationContext =
    method === "manual"
      ? fromManual(country, regionValue)
      : method && normalizedConfidence
        ? fromDetected({
            country,
            region: regionValue,
            method,
            confidence: normalizedConfidence,
            resolvedAt: undefined
          })
        : fromQuery({ country, region: regionValue });
  const title = titleForJurisdiction({ country, region: regionValue });

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
  const status = computeStatus(profile);
  const { bullets, risksText } = buildExplanationInput(profile);
  const fallbackText = buildFallbackText({
    profile,
    status,
    bullets,
    risksText,
    locale: "en"
  });
  const viewModel = buildResultViewModel({
    profile,
    title,
    locationContext
  });

  const isPaidUser = false;

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <ResultCard
          profile={profile}
          title={title}
          locationContext={locationContext}
          cacheCell={cacheCell}
          viewModel={viewModel}
          isPaidUser={isPaidUser}
          simpleTerms={
            <SimpleTermsClient
              country={country}
              region={country === "US" ? region : undefined}
              fallbackText={fallbackText}
            />
          }
        />
        {locationContext.method && locationContext.confidence ? (
          <TripEventLogger
            event={{
              jurisdictionKey: profile.id,
              country: profile.country,
              region: profile.region,
              method: locationContext.method,
              confidence: locationContext.confidence,
              statusLevel: status.level,
              statusCode: buildTripStatusCode(profile),
              verified_at: profile.verified_at ?? undefined,
              needs_review: profile.status !== "known"
            }}
          />
        ) : null}
      </div>
    </main>
  );
}
