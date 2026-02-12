import styles from "./page.module.css";
import HomeActions from "./_components/HomeActions";
import MapSection from "./_components/MapSection";
export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.card}>
          <header className={styles.hero}>
            <h1>Where are you right now?</h1>
            <p className={styles.subtitle}>
              Clear, up-to-date cannabis laws by location. No advice. Just facts.
            </p>
          </header>

          <HomeActions />
        </section>
        <section className={styles.card}>
          <MapSection />
        </section>
      </main>
      <div className={styles.disclaimerSticky}>
        Educational only. Not legal advice. Laws change.
      </div>
    </div>
  );
}
