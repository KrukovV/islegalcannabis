"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import styles from "../page.module.css";

const COUNTRY_OPTIONS = [
  { code: "US", label: "United States" },
  { code: "DE", label: "Germany" }
];

const REGION_OPTIONS = [{ code: "CA", label: "California" }];

function buildResultUrl(country: string, region?: string) {
  const params = new URLSearchParams({ country });
  if (region) params.set("region", region);
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

  const resolveByIp = async () => {
    try {
      const res = await fetch("/api/whereami");
      const data = await res.json();

      if (!res.ok || !data?.ok || !data?.country) {
        setError("We could not determine a location. Choose manually.");
        setShowManual(true);
        return;
      }

      setNotice("GPS unavailable — using approximate location by IP.");
      router.push(buildResultUrl(data.country, data.region));
    } catch {
      setError("We could not determine a location. Choose manually.");
      setShowManual(true);
    }
  };

  const handleUseLocation = () => {
    setError(null);
    setNotice(null);

    if (!navigator.geolocation) {
      resolveByIp();
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

          router.push(buildResultUrl(data.country, data.region));
        } catch {
          await resolveByIp();
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        resolveByIp();
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

    router.push(buildResultUrl(country, country === "US" ? region : undefined));
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
          {locating ? "Locating..." : "Use my location"}
        </button>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={() => setShowManual((prev) => !prev)}
        >
          Choose manually
        </button>
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
    </section>
  );
}
