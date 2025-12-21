import styles from "./page.module.css";
import HomeActions from "./_components/HomeActions";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.hero}>
          <p className={styles.kicker}>Cannabis law explainer</p>
          <h1>Check local cannabis rules in seconds.</h1>
          <p className={styles.subtitle}>
            A calm, factual summary of the rules that matter most today.
          </p>
        </header>

        <HomeActions />

        <div className={styles.disclaimer}>
          Educational only. Not legal advice. Laws change.
        </div>
      </main>
    </div>
  );
}
