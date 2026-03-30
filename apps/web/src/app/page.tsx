import styles from "./page.module.css";
import MapSection from "./_components/MapSection";
import { getBuildStamp } from "@/lib/buildStamp";
export default function Home() {
  const buildStamp = getBuildStamp();
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <MapSection buildStamp={buildStamp} />
      </main>
    </div>
  );
}
