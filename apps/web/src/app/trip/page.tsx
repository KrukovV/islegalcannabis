import TripTimeline from "./TripTimeline";
import styles from "./trip.module.css";

export const runtime = "nodejs";

export default function TripPage() {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <TripTimeline />
      </div>
    </main>
  );
}
