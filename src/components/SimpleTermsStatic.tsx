import Link from "next/link";
import styles from "./SimpleTerms.module.css";

type SimpleTermsStaticProps = {
  text: string;
  ctaHref?: string;
  ctaLabel?: string;
};

export default function SimpleTermsStatic({
  text,
  ctaHref = "/",
  ctaLabel = "Open interactive check"
}: SimpleTermsStaticProps) {
  return (
    <div className={styles.wrapper}>
      <h2>In simple terms</h2>
      <p className={styles.text}>{text}</p>
      <p className={styles.note}>Educational only. Not legal advice.</p>
      <Link className={styles.link} href={ctaHref}>
        {ctaLabel}
      </Link>
    </div>
  );
}
