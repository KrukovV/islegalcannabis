"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import type { Trip } from "@islegal/shared";
import styles from "../page.module.css";
import {
  confidenceForLocation,
  shouldHighlightManualAction
} from "@/lib/geo/locationResolution";
import { resolveGeoLocation } from "@/lib/geo/geo_resolver";
import {
  loadManualSelection,
  saveManualSelection
} from "@/lib/geo/manual_store";
import { writeGeoLoc } from "@/lib/ssot/write_ssot";
import LocationMeta from "@/components/LocationMeta";
import type { LocationContext } from "@/lib/location/locationContext";
import {
  fromDetected,
  fromManual,
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

const GEO_PROMPT_SHOWN_KEY = "ilc:geo_prompt_shown";
const GEO_PROMPT_TS_KEY = "ilc:geo_prompt_ts";
const GEO_USER_OPTIN_KEY = "ilc:geo_user_optin";
const GEO_PERMISSION_LAST_KEY = "ilc:geo_permission_last";
const GEO_LAST_OK_TS_KEY = "ilc:geo_last_ok_ts";
const GEO_SOURCE_KEY = "ilc:geo_source";
const GEO_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

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
  const initialContext = loadLocationContext();
  const manualContext =
    initialContext?.mode === "manual" ? initialContext : null;
  const [showManual, setShowManual] = useState(false);
  const [country, setCountry] = useState(
    () => manualContext?.country ?? "US"
  );
  const [region, setRegion] = useState(
    () => manualContext?.region ?? "CA"
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationContext, setLocationContext] =
    useState<LocationContext | null>(() => manualContext ?? null);
  const [trip, setTrip] = useState<Trip | null>(
    () => getTripSummary().trip
  );
  const [recentLabel, setRecentLabel] = useState<string | null>(() => {
    if (!historyEnabled) return null;
    const history = loadLocationHistory();
    return history[0] ? formatRecentEntry(history[0]) : null;
  });
  const [geoPromptVisible, setGeoPromptVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const optin = window.localStorage.getItem(GEO_USER_OPTIN_KEY);
      const lastPrompt = Number(window.localStorage.getItem(GEO_PROMPT_TS_KEY) || "0");
      const elapsed = Date.now() - lastPrompt;
      const hasManual = Boolean(loadManualSelection());
      return !hasManual && optin !== "1" && (optin !== "0" || elapsed > GEO_COOLDOWN_MS);
    } catch {
      return false;
    }
  });
  const [geoPermission, setGeoPermission] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(GEO_PERMISSION_LAST_KEY);
    } catch {
      return null;
    }
  });

  const refreshTrip = () => {
    const summary = getTripSummary();
    setTrip(summary.trip);
  };

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

  const persistGeoMeta = (permission: string, source: string) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(GEO_PERMISSION_LAST_KEY, permission);
      window.localStorage.setItem(GEO_SOURCE_KEY, source);
    } catch {
      // Ignore storage failures.
    }
  };

  const applyResolution = async (result: Awaited<ReturnType<typeof resolveGeoLocation>>) => {
    if (result.source === "none" || result.iso === "UNKNOWN") {
      setNotice("We couldn't determine your location. Please choose manually.");
      setShowManual(true);
      await writeGeoLoc({
        source: "none",
        iso: "UNKNOWN",
        confidence: 0.0
      });
      return;
    }

    const context =
      result.source === "manual"
        ? fromManual(result.iso, result.state)
        : fromDetected({
            country: result.iso,
            region: result.state,
            method: result.source,
            confidence: confidenceForLocation(result.source)
          });

    saveLocationContext(context);
    setLocationContext(context);
    recordHistory(context);
    persistGeoMeta(result.permission, result.source.toUpperCase());
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(GEO_LAST_OK_TS_KEY, String(Date.now()));
      } catch {
        // Ignore storage failures.
      }
    }
    await writeGeoLoc({
      source: result.source,
      iso: result.iso,
      state: result.state,
      confidence: result.confidence
    });
    if (result.source === "ip") {
      setNotice("GPS unavailable — using IP-based location.");
    } else if (result.source === "gps" && result.reason === "timeout") {
      setNotice("Using a coarse location estimate. Verify manually if needed.");
    } else {
      setNotice(null);
    }
    router.push(buildResultUrl(context, result.cell));
  };

  const requestBrowserLocation = async (permissionHint?: string) => {
    setError(null);
    setNotice(null);
    setLocating(true);
    const resolved = await resolveGeoLocation({ permissionHint });
    setGeoPermission(resolved.permission);
    const mapped = resolved.reason ? mapGeoError() : null;
    if (mapped?.showManual) setShowManual(true);
    await applyResolution(resolved);
    setLocating(false);
  };

  const handleUseLocation = () => {
    requestBrowserLocation();
  };

  const handleGeoAllow = async () => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(GEO_USER_OPTIN_KEY, "1");
        window.localStorage.setItem(GEO_PROMPT_SHOWN_KEY, "1");
        window.localStorage.setItem(GEO_PROMPT_TS_KEY, String(Date.now()));
      } catch {
        // Ignore storage failures.
      }
    }
    setGeoPromptVisible(false);
    requestBrowserLocation("prompt");
  };

  const handleGeoLater = () => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(GEO_USER_OPTIN_KEY, "0");
        window.localStorage.setItem(GEO_PROMPT_SHOWN_KEY, "1");
        window.localStorage.setItem(GEO_PROMPT_TS_KEY, String(Date.now()));
      } catch {
        // Ignore storage failures.
      }
    }
    setGeoPromptVisible(false);
  };

  const handleGeoManual = () => {
    handleGeoLater();
    setShowManual(true);
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
    saveManualSelection({
      iso: country,
      state: country === "US" ? region : undefined
    });
    saveLocationContext(context);
    setLocationContext(context);
    recordHistory(context);
    persistGeoMeta("prompt", "MANUAL");
    writeGeoLoc({
      source: "manual",
      iso: country,
      state: country === "US" ? region : undefined,
      confidence: 1.0
    });
    router.push(buildResultUrl(context));
  };

  return (
    <section className={styles.actions}>
      {geoPromptVisible ? (
        <div className={styles.geoPrompt}>
          <div>
            <strong>Use your browser location?</strong>
            <p>
              We only store country/region. You can skip and choose manually.
            </p>
          </div>
          <div className={styles.geoPromptActions}>
            <button
              className={styles.primaryButton}
              type="button"
              onClick={handleGeoAllow}
            >
              Allow
            </button>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={handleGeoLater}
            >
              Not now
            </button>
            <button
              className={styles.ghostButton}
              type="button"
              onClick={handleGeoManual}
            >
              Choose manually
            </button>
          </div>
          {geoPermission ? (
            <span className={styles.geoPromptHint}>
              Permission: {geoPermission}
            </span>
          ) : null}
        </div>
      ) : null}
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
