import type { StatusResult } from "@/lib/status";
import styles from "./StatusBadge.module.css";

export default function StatusBadge({ status }: { status: StatusResult }) {
  return (
    <div className={`${styles.badge} ${styles[status.level]}`}>
      <span className={styles.icon}>{status.icon}</span>
      <span>{status.label}</span>
    </div>
  );
}
