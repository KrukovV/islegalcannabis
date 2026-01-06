"use client";

import { useMemo, useState } from "react";
import type { Trip, TripEvent } from "@islegal/shared";
import {
  formatRemaining,
  getTripSummary,
  startTrip,
  startTripPass,
  stopTrip
} from "@/lib/tripStore";
import styles from "./trip.module.css";

type TripSummary = {
  trip: Trip | null;
  events: TripEvent[];
};

function formatMethod(method: TripEvent["method"]) {
  if (method === "gps") return "GPS";
  if (method === "ip") return "IP";
  return "Manual";
}

function formatJurisdiction(event: TripEvent) {
  if (event.region) {
    return `${event.country}-${event.region}`;
  }
  return event.country;
}

export default function TripTimeline() {
  const [summary, setSummary] = useState<TripSummary>(() => getTripSummary());
  const [onlyChanges, setOnlyChanges] = useState(false);

  const filteredEvents = useMemo(() => {
    if (!onlyChanges) return summary.events;
    const result: TripEvent[] = [];
    let lastKey: string | null = null;
    summary.events.forEach((event) => {
      if (event.jurisdictionKey !== lastKey) {
        result.push(event);
        lastKey = event.jurisdictionKey;
      }
    });
    return result;
  }, [onlyChanges, summary.events]);

  const handleStartFree = () => {
    const trip = startTrip("free");
    setSummary({ trip, events: [] });
  };

  const handleStartPass = (days: number) => {
    const trip = startTripPass(days);
    setSummary({ trip, events: [] });
  };

  const handleStop = () => {
    stopTrip();
    setSummary(getTripSummary());
  };

  const trip = summary.trip;
  const remaining = trip?.endsAt ? formatRemaining(trip) : null;
  const isActive = Boolean(trip?.isActive);
  const ended = Boolean(trip?.endsAt && remaining === "ended");

  return (
    <section className={styles.timeline}>
      <header className={styles.header}>
        <div>
          <h1>Trip timeline</h1>
          <p className={styles.subtle}>
            We store only jurisdictions (country/region), not your exact location.
          </p>
        </div>
        <div className={styles.controls}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={onlyChanges}
              onChange={(event) => setOnlyChanges(event.target.checked)}
            />
            Only changes
          </label>
        </div>
      </header>

      <div className={styles.tripStatus}>
        {trip ? (
          <>
            <span className={styles.tripBadge}>
              {trip.isActive ? "Active" : "Inactive"}
            </span>
            {trip.plan === "trip_pass" && remaining ? (
              <span className={styles.tripMeta}>
                {ended ? "Trip ended" : `Ends in ${remaining}`}
              </span>
            ) : null}
            {trip.plan === "free" ? (
              <span className={styles.tripMeta}>
                Free plan: last {trip.maxEvents} events or {trip.maxDays} day
              </span>
            ) : null}
          </>
        ) : (
          <span className={styles.tripMeta}>No trip started yet.</span>
        )}
      </div>

      <div className={styles.actions}>
        {isActive ? (
          <button className={styles.secondary} type="button" onClick={handleStop}>
            Stop trip
          </button>
        ) : (
          <>
            <button className={styles.primary} type="button" onClick={handleStartFree}>
              Start free trip
            </button>
            <button
              className={styles.secondary}
              type="button"
              onClick={() => handleStartPass(7)}
            >
              Start Trip Pass (7 days)
            </button>
          </>
        )}
      </div>

      {trip?.plan === "free" ? (
        <div className={styles.paywall}>
          <strong>Upgrade for full trip history</strong>
          <p>Trip Pass keeps up to 7–14 days and more events.</p>
        </div>
      ) : null}

      <ul className={styles.eventList}>
        {filteredEvents.length === 0 ? (
          <li className={styles.empty}>No events yet.</li>
        ) : (
          filteredEvents.map((event) => (
            <li key={event.id} className={styles.eventCard}>
              <div>
                <p className={styles.eventTime}>
                  {new Date(event.ts).toLocaleString()}
                </p>
                <p className={styles.eventJurisdiction}>
                  {formatJurisdiction(event)}
                </p>
                <p className={styles.eventStatus}>
                  {event.statusLevel.toUpperCase()} · {event.statusCode}
                </p>
              </div>
              <span className={styles.methodBadge}>
                {formatMethod(event.method)}
              </span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
