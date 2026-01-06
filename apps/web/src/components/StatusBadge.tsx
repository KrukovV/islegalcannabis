import type { ResultStatusLevel } from "@islegal/shared";
import styles from "./StatusBadge.module.css";

const icons: Record<ResultStatusLevel, string> = {
  green: "✅",
  yellow: "⚠️",
  red: "⛔",
  gray: "⚪"
};

export default function StatusBadge({
  level,
  label
}: {
  level: ResultStatusLevel;
  label: string;
}) {
  return (
    <div className={`${styles.badge} ${styles[level]}`}>
      <span className={styles.icon}>{icons[level]}</span>
      <span>{label}</span>
    </div>
  );
}
