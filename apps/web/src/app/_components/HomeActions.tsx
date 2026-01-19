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
  pickLocation,
  toLocationResolution
} from "@/lib/location/locationContext";
import {
  loadLocationContext,
  saveLocationContext
} from "@/lib/location/locationStorage";
import {
  clearLocationHistory,
  formatRecentEntry,
  loadLocationHistory,
  saveLocationHistory
} from "@/lib/location/locationHistory";
import { mapGeoError } from "@/lib/ui/geoErrors";
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
  return `/check?${params.toString()}`;
}

export default function HomeActions() {
  const router = useRouter();
  const historyEnabled = process.env.NEXT_PUBLIC_HISTORY === "1";
  const [showManual, setShowManual] = useState(false);
  const [country, setCountry] = useState("US");
  const [region, setRegion] = useState("CA");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationContext, setLocationContext] =
    useState<LocationContext | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [recentLabel, setRecentLabel] = useState<string | null>(null);

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
    if (historyEnabled) {
      const history = loadLocationHistory();
      if (history[0]) {
        setRecentLabel(formatRecentEntry(history[0]));
      }
    }
  }, [historyEnabled]);

  const recordHistory = (context: LocationContext) => {
    if (!historyEnabled) return;
    if (!context.method || !context.confidence) return;
    saveLocationHistory({
      country: context.country,
      region: context.region,
      method: context.method,
      confidence: context.confidence,
      checkedAt: new Date().toISOString()
    });
    setRecentLabel(
      formatRecentEntry({
        country: context.country,
        region: context.region,
        method: context.method,
        confidence: context.confidence,
        checkedAt: new Date().toISOString()
      })
    );
  };

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
        confidence: confidenceForLocation("ip")
      });
      const manualContext = loadLocationContext();
      const { loc: preferred } = pickLocation({
        manual: manualContext?.mode === "manual" ? manualContext : null,
        ip: context
      });
      if (preferred?.mode === "manual") {
        router.push(buildResultUrl(preferred));
        return;
      }
      const selected = preferred ?? context;
      saveLocationContext(selected);
      setLocationContext(selected);
      setNotice("GPS unavailable — using IP-based location.");
      recordHistory(selected);
      setTimeout(() => {
        router.push(buildResultUrl(selected));
      }, 1200);
    } catch {
      setNotice("Can't reach server. Check your connection or choose manually.");
      setShowManual(true);
    }
  };

  const handleUseLocation = () => {
    setError(null);
    setNotice(null);
    const stored = loadLocationContext();
    if (stored?.mode === "manual") {
      router.push(buildResultUrl(stored));
      return;
    }
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
            confidence: confidenceForLocation("gps")
          });
          const ipCandidate = await ipPromise;
          const ipContext = ipCandidate
            ? fromDetected({
                country: ipCandidate.country,
                region: ipCandidate.region,
                method: "ip",
                confidence: confidenceForLocation("ip")
              })
            : null;
          const manualContext = loadLocationContext();
          const { loc: preferred } = pickLocation({
            manual: manualContext?.mode === "manual" ? manualContext : null,
            gps: gpsContext,
            ip: ipContext
          });
          if (preferred?.mode === "manual") {
            router.push(buildResultUrl(preferred));
            return;
          }
          if (preferred) {
            saveLocationContext(preferred);
            setLocationContext(preferred);
            recordHistory(preferred);
            router.push(
              buildResultUrl(
                preferred,
                preferred.method === "gps" ? gpsCell : undefined
              )
            );
          }
        } catch {
          const mapped = mapGeoError();
          setNotice(mapped.message);
          if (mapped.showManual) setShowManual(true);
        } finally {
          setLocating(false);
        }
      },
      (geoError) => {
        setLocating(false);
        const mapped = mapGeoError(geoError?.code);
        setNotice(mapped.message);
        if (mapped.showManual) setShowManual(true);
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
    recordHistory(context);
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
      {historyEnabled ? (
        <div className={styles.recentRow}>
          <span className={styles.recentLabel}>
            Recent: {recentLabel ?? "No recent locations"}
          </span>
          <button
            className={styles.recentClear}
            type="button"
            onClick={() => {
              clearLocationHistory();
              setRecentLabel(null);
            }}
          >
            Clear
          </button>
        </div>
      ) : null}
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
