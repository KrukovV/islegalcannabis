import Link from "next/link";
import styles from "./CheckErrorCard.module.css";

export type CheckErrorCardProps = {
  title: string;
  message: string;
  requestId?: string | null;
  retryHref: string;
};

export default function CheckErrorCard({
  title,
  message,
  requestId,
  retryHref
}: CheckErrorCardProps) {
  return (
    <div className={styles.card}>
      <h1>{title}</h1>
      <p className={styles.message}>{message}</p>
      {requestId ? (
        <p className={styles.meta}>Request ID: {requestId.slice(0, 8)}</p>
      ) : null}
      <div className={styles.actions}>
        <Link className={styles.primary} href={retryHref}>
          Retry
        </Link>
        <Link className={styles.secondary} href="/">
          Change location
        </Link>
      </div>
    </div>
  );
}
