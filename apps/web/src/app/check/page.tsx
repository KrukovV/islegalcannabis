import Link from "next/link";
import ResultCard from "@/components/ResultCard";
import CheckErrorCard from "@/components/CheckErrorCard";
import { GET as checkGET } from "../api/check/route";
import { fromDetected, fromManual, fromQuery } from "@/lib/location/locationContext";
import { mapCheckError } from "@/lib/ui/checkErrors";
import styles from "../result/result.module.css";

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

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <ResultCard
          profile={json.profile}
          title={json.viewModel?.title ?? json.profile.id}
          isPaidUser={Boolean(json.viewModel?.meta?.paid)}
          isPro={isPro}
          proPreviewHref={proPreviewHref}
          advancedNearest={json.nearest ?? undefined}
          locationContext={locationContext}
          viewModel={json.viewModel}
          showSources
          wikiLinks={json.wiki_links}
          linksTrust={json.links_trust}
        />
        <Link className={styles.backLink} href="/">
          Back to location search
        </Link>
      </div>
    </main>
  );
}
