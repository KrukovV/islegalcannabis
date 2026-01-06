"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import type { LocationResolution } from "@islegal/shared";
import styles from "../page.module.css";
import {
  buildLocationResolution,
  formatLocationMethodHint,
  formatLocationMethodLabel,
  selectPreferredLocationResolution,
  shouldHighlightManualAction
} from "@/lib/geo/locationResolution";

const COUNTRY_OPTIONS = [
  { code: "US", label: "United States" },
  { code: "DE", label: "Germany" }
];

const REGION_OPTIONS = [{ code: "CA", label: "California" }];

function buildResultUrl(
  country: string,
  region?: string,
  resolution?: LocationResolution
) {
  const params = new URLSearchParams({ country });
  if (region) params.set("region", region);
  if (resolution) {
    params.set("method", resolution.method);
    params.set("confidence", resolution.confidence);
    if (resolution.note) params.set("locNote", resolution.note);
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
  const [locationResolution, setLocationResolution] =
    useState<LocationResolution | null>(null);

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

      const resolution = buildLocationResolution("ip", data.region);
      setLocationResolution(resolution);
      setNotice("GPS unavailable — using IP-based location.");
      setTimeout(() => {
        router.push(buildResultUrl(data.country, data.region, resolution));
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
          const gpsCandidate = { country: data.country, region: data.region };
          const ipCandidate = await ipPromise;
          const resolution = selectPreferredLocationResolution({
            gps: gpsCandidate,
            ip: ipCandidate ?? undefined
          });
          setLocationResolution(resolution);
          router.push(buildResultUrl(data.country, data.region, resolution));
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

    const resolution = buildLocationResolution(
      "manual",
      country === "US" ? region : undefined
    );
    setLocationResolution(resolution);
    router.push(buildResultUrl(country, country === "US" ? region : undefined, resolution));
  };

  return (
    <section className={styles.actions}>
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
            shouldHighlightManualAction(locationResolution)
              ? styles.secondaryButtonHighlight
              : ""
          }`}
          type="button"
          onClick={() => setShowManual((prev) => !prev)}
        >
          🌍 Choose manually
        </button>
        {shouldHighlightManualAction(locationResolution) ? (
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
      {locationResolution ? (
        <div className={styles.locationInfo}>
          <p className={styles.methodLine}>
            {formatLocationMethodLabel(locationResolution)}
          </p>
          {formatLocationMethodHint(locationResolution) ? (
            <p className={styles.methodHint}>
              {formatLocationMethodHint(locationResolution)}
            </p>
          ) : null}
          {locationResolution.note ? (
            <p className={styles.methodHint}>{locationResolution.note}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
