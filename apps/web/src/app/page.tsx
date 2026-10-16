import type { Metadata } from "next";
import Link from "next/link";
import { formatVisibleRuntimeStamp } from "@/lib/runtimeIdentity";
import { getTruthMapRuntimeIdentity } from "./truth-map/runtimeConfig";
import HomeMapEntry from "./_components/HomeMapEntry";
import { STATIC_TRUTH_MAP_COUNTRIES_URL, STATIC_TRUTH_MAP_US_STATES_URL } from "@/truth-map/staticTruthMapUrls";
import styles from "./page.module.css";

export const dynamic = "force-static";
export const metadata: Metadata = {
  title: "Cannabis Legality Map — Laws by Country and U.S. State",
  description: "Explore current cannabis legality by country and U.S. state, retained official legal evidence and verified regulated cannabis locations.",
  robots: { index: true, follow: true },
};

export default function HomePage() {
  const runtimeIdentity = getTruthMapRuntimeIdentity();

  const mapProps = {
    countriesUrl: STATIC_TRUTH_MAP_COUNTRIES_URL,
    usStatesUrl: STATIC_TRUTH_MAP_US_STATES_URL,
    visibleStamp: formatVisibleRuntimeStamp(runtimeIdentity),
    runtimeIdentity,
  };

  return (
    <>
      <link rel="canonical" href="https://www.islegal.info/" />
      <div className={styles.map}>
        <HomeMapEntry {...mapProps} />
        <nav aria-label="Browse jurisdictions" className={styles.jurisdictionDirectoryNav}>
          <Link href="/jurisdictions" prefetch={false} className={styles.jurisdictionDirectoryLink}>Browse all jurisdictions</Link>
        </nav>
      </div>
    </>
  );
}
