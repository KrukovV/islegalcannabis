"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Trip } from "@islegal/shared";
import styles from "../page.module.css";
import {
  confidenceForLocation,
  shouldHighlightManualAction
} from "@/lib/geo/locationResolution";
import LocationMeta from "@/components/LocationMeta";
import type { LocationContext } from "@/lib/location/locationContext";
import {
  fromDetected,
  fromManual,
  pickPreferredContext,
  toLocationResolution
} from "@/lib/location/locationContext";
import {
  loadLocationContext,
  saveLocationContext
} from "@/lib/location/locationStorage";
import { buildGpsCell } from "@/lib/nearbyCacheStorage";
import {
  formatRemaining,
  getTripSummary,
  startTrip,
  stopTrip
} from "@/lib/tripStore";

const COUNTRY_OPTIONS = [
  { code: "US", label: "United States" },
  { code: "DE", label: "Germany" }
];

const REGION_OPTIONS = [{ code: "CA", label: "California" }];

function buildResultUrl(context: LocationContext, cell?: string) {
  const params = new URLSearchParams({ country: context.country });
  if (context.region) params.set("region", context.region);
  if (context.method && context.confidence) {
    params.set("method", context.method);
    params.set("confidence", context.confidence);
  }
  if (cell) {
    params.set("cell", cell);
  }
  return `/result?${params.toString()}`;
}

export default function HomeActions() {
  const router = useRouter();
  const [showManual, setShowManual] = useState(false);
  const [country, setCountry] = useState("US");
  const [region, setRegion] = useState("CA");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationContext, setLocationContext] =
    useState<LocationContext | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);

  const refreshTrip = () => {
    const summary = getTripSummary();
    setTrip(summary.trip);
  };

  useEffect(() => {
    refreshTrip();
    const saved = loadLocationContext();
    if (saved?.mode === "manual") {
      setCountry(saved.country);
      setRegion(saved.region ?? "");
      setLocationContext(saved);
    }
  }, []);

  const handleToggleTrip = () => {
    if (trip?.isActive) {
      stopTrip();
      refreshTrip();
      return;
    }
    const newTrip = startTrip("free");
    setTrip(newTrip);
  };

  const fetchWhereAmI = async () => {
    try {
      const res = await fetch("/api/whereami");
      const data = await res.json();

      if (!res.ok || !data?.ok || !data?.country) {
        return null;
      }

      return { country: data.country, region: data.region };
    } catch {
      return null;
    }
  };

  const resolveByIp = async (
    prefetched?: Promise<{ country: string; region?: string } | null>
  ) => {
    try {
      const data = await (prefetched ?? fetchWhereAmI());

      if (!data?.country) {
        setNotice("We couldn't determine your location. Please choose manually.");
        setShowManual(true);
        return;
      }

      const context = fromDetected({
        country: data.country,
        region: data.region,
        method: "ip",
        confidence: confidenceForLocation("ip", data.region)
      });
      saveLocationContext(context);
      setLocationContext(context);
      setNotice("GPS unavailable — using IP-based location.");
      setTimeout(() => {
        router.push(buildResultUrl(context));
      }, 1200);
    } catch {
      setNotice("We couldn't determine your location. Please choose manually.");
      setShowManual(true);
    }
  };

  const handleUseLocation = () => {
    setError(null);
    setNotice(null);
    const ipPromise = fetchWhereAmI();

    if (!navigator.geolocation) {
      resolveByIp(ipPromise);
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          const res = await fetch(`/api/reverse-geocode?lat=${lat}&lon=${lon}`);
          const data = await res.json();

          if (!res.ok || !data?.ok) {
            throw new Error("reverse_geocode_failed");
          }

          if (data.provider === "bbox") {
            setNotice("Using a coarse location estimate. Verify manually if needed.");
          } else {
            setNotice(null);
          }
          const gpsCell = buildGpsCell(lat, lon);
          const gpsContext = fromDetected({
            country: data.country,
            region: data.region,
            method: "gps",
            confidence: confidenceForLocation("gps", data.region)
          });
          const ipCandidate = await ipPromise;
          const ipContext = ipCandidate
            ? fromDetected({
                country: ipCandidate.country,
                region: ipCandidate.region,
                method: "ip",
                confidence: confidenceForLocation("ip", ipCandidate.region)
              })
            : null;
          const preferred = pickPreferredContext([gpsContext, ipContext]);
          if (preferred) {
            saveLocationContext(preferred);
            setLocationContext(preferred);
            router.push(
              buildResultUrl(
                preferred,
                preferred.method === "gps" ? gpsCell : undefined
              )
            );
          }
        } catch {
          setNotice("We couldn't verify your GPS location. Please choose manually.");
          setShowManual(true);
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        resolveByIp(ipPromise);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  };

  const handleManualSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (country === "US" && !region) {
      setError("Select a state to continue.");
      return;
    }

    const context = fromManual(country, country === "US" ? region : undefined);
    saveLocationContext(context);
    setLocationContext(context);
    router.push(buildResultUrl(context));
  };

  return (
    <section className={styles.actions}>
      <div className={styles.tripRow}>
        <label className={styles.tripToggle}>
          <input
            type="checkbox"
            checked={Boolean(trip?.isActive)}
            onChange={handleToggleTrip}
          />
          Trip mode: {trip?.isActive ? "On" : "Off"}
        </label>
        <span className={styles.tripHint}>
          We store only jurisdictions (country/region), not your exact location.
        </span>
        {trip?.isActive && trip.endsAt ? (
          <span className={styles.tripHint}>
            Active • ends in {formatRemaining(trip)}
          </span>
        ) : null}
        {trip?.plan === "free" ? (
          <span className={styles.tripHint}>
            Upgrade to Trip Pass to keep full trip history.
          </span>
        ) : null}
        <Link className={styles.tripLink} href="/trip">
          View trip timeline
        </Link>
      </div>
      <div className={styles.primaryActions}>
        <button
          className={styles.primaryButton}
          type="button"
          onClick={handleUseLocation}
          disabled={locating}
        >
          {locating ? "Locating..." : "📍 Use my location"}
        </button>
        <button
          className={`${styles.secondaryButton} ${
            shouldHighlightManualAction(toLocationResolution(locationContext))
              ? styles.secondaryButtonHighlight
              : ""
          }`}
          type="button"
          onClick={() => setShowManual((prev) => !prev)}
        >
          🌍 Choose manually
        </button>
        {shouldHighlightManualAction(toLocationResolution(locationContext)) ? (
          <span className={styles.manualHint}>Location may be approximate</span>
        ) : null}
      </div>

      {showManual ? (
        <form className={styles.manualForm} onSubmit={handleManualSubmit}>
          <label className={styles.field}>
            <span>Country</span>
            <select
              value={country}
              onChange={(event) => setCountry(event.target.value)}
            >
              {COUNTRY_OPTIONS.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {country === "US" ? (
            <label className={styles.field}>
              <span>State</span>
              <select
                value={region}
                onChange={(event) => setRegion(event.target.value)}
              >
                {REGION_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <button className={styles.ghostButton} type="submit">
            Check rules
          </button>
        </form>
      ) : null}

      {notice ? <p className={styles.notice}>{notice}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {locationContext ? (
        <LocationMeta
          className={styles.locationInfo}
          labelClassName={styles.methodLine}
          hintClassName={styles.methodHint}
          context={locationContext}
        />
      ) : null}
    </section>
  );
}
