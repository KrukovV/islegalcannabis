"use client";

import { useEffect, useMemo, useState } from "react";
import { SSOTStatusText, statusTruthBadge, type TruthLevel } from "@/lib/statusUi";
import { explainSSOT } from "@/lib/ssotExplain";
import styles from "./LeafletMap.module.css";

type StatusEntry = {
  geo: string;
  name?: string;
  recEffective?: string;
  medEffective?: string;
  recDerived?: string;
  medDerived?: string;
  truthLevel?: TruthLevel;
  officialOverride?: boolean;
  officialLinksCount?: number;
  reasons?: string[];
  wikiPage?: string | null;
  sources?: string[];
};

type Props = {
  statusIndex: Record<string, StatusEntry>;
  mapMode: "CI" | "DEV";
  dataOk: boolean;
  dataSource: string;
  mapEnabled: boolean;
  premiumMode: "FREE" | "PAID";
  nearbyMode: "SKIP" | "RUN";
  showLegality: boolean;
};

async function fetchGeoLoc() {
  try {
    const res = await fetch("/api/geo/loc", { cache: "no-store" });
    if (!res.ok) return { geo: "-", iso: "-", state: "-" };
    const json = await res.json();
    const iso = String(json?.iso || "-").toUpperCase();
    const region = String(json?.region || "-").toUpperCase();
    const geo = iso && region && region !== "-" ? `${iso}-${region}` : iso;
    return { geo, iso, state: region };
  } catch {
    return { geo: "-", iso: "-", state: "-" };
  }
}

export default function MapSummary({
  statusIndex,
  mapMode,
  dataOk,
  dataSource,
  mapEnabled,
  premiumMode,
  nearbyMode,
  showLegality
}: Props) {
  const [geoLoc, setGeoLoc] = useState<{ geo: string; iso: string; state: string }>({
    geo: "-",
    iso: "-",
    state: "-"
  });

  const mapTiles = dataSource.includes("TILES_OFFLINE") ? "OFFLINE" : "NETWORK";

  useEffect(() => {
    fetchGeoLoc().then(setGeoLoc);
  }, []);

  useEffect(() => {
    if (!dataOk) {
      console.warn(
        `MAP_FAIL reason=SSOT_MISSING MAP_MODE=${mapMode} MAP_TILES=${mapTiles} MAP_DATA_SOURCE=SSOT`
      );
      console.warn(`MAP_SUMMARY_OK=0 MAP_MODE=${mapMode} MAP_DATA_SOURCE=SSOT`);
      return;
    }
    const rendered = mapEnabled && mapMode === "DEV" ? "YES" : "NO";
    console.warn(`MAP_OK=1 MAP_MODE=${mapMode} MAP_TILES=${mapTiles} MAP_DATA_SOURCE=SSOT`);
    console.warn(`MAP_SUMMARY_OK=1 MAP_MODE=${mapMode} MAP_DATA_SOURCE=SSOT`);
    console.warn(`MAP_RENDERED=${rendered} MAP_DATA_SOURCE=SSOT`);
    console.warn(`PREMIUM_MODE=${premiumMode}`);
    console.warn(`NEARBY_MODE=${nearbyMode}`);
  }, [dataOk, mapMode, mapTiles, mapEnabled, premiumMode, nearbyMode]);

  const entry = useMemo(() => statusIndex[geoLoc.geo] || null, [statusIndex, geoLoc.geo]);
  const name = entry?.name || geoLoc.geo || "-";
  const effectiveRec = entry?.recDerived || entry?.recEffective || "Unknown";
  const effectiveMed = entry?.medDerived || entry?.medEffective || "Unknown";
  const truthLevel = entry?.truthLevel || "WIKI_ONLY";
  SSOTStatusText({
    truthLevel,
    recEffective: effectiveRec,
    medEffective: effectiveMed
  });
  const explain = explainSSOT({
    truthLevel,
    officialLinksCount: entry?.officialLinksCount || 0,
    recEffective: effectiveRec,
    medEffective: effectiveMed,
    reasons: entry?.reasons || []
  });
  const truthBadge = statusTruthBadge(truthLevel);
  const statusSource = "SSOT_ONLY";
  const wikiPage = entry?.wikiPage || "";
  const official = entry?.officialLinksCount ? `YES (${entry.officialLinksCount})` : "NO";
  const reasonText = Array.isArray(entry?.reasons) && entry?.reasons?.length
    ? entry?.reasons.join(", ")
    : "-";

  if (!dataOk) {
    return (
      <div className={styles.mapSummary}>
        <strong>SSOT_MISSING</strong>
        <div>Map data is unavailable.</div>
      </div>
    );
  }

  return (
    <div className={styles.mapSummary}>
      <div className={styles.mapSummaryTitle}>You are in: {name}</div>
      {showLegality ? (
        <>
          <div className={styles.mapSummaryRow}>Status source: {statusSource}</div>
          <div className={styles.mapSummaryRow}>
            SSOT truth level: {truthLevel} {truthBadge.icon} {truthBadge.label}
          </div>
          <div className={styles.mapSummaryRow}>
            Статус: {explain.recStatusShort}
          </div>
          <div className={styles.mapSummaryRow}>
            Статус (medical): {explain.medStatusShort}
          </div>
          <div className={styles.mapSummaryRow}>
            Уверенность: {explain.reliabilityText}
          </div>
          <div className={styles.mapSummaryRow}>Почему: {explain.whyText}</div>
          <div className={styles.mapSummaryRow}>Truth reasons: {reasonText}</div>
          <div className={styles.mapSummaryRow}>Official: {official}</div>
          <div className={styles.mapSummaryRow}>
            Wiki Page:{" "}
            {wikiPage ? (
              <a href={wikiPage} target="_blank" rel="noreferrer noopener">
                {wikiPage}
              </a>
            ) : (
              "-"
            )}
          </div>
        </>
      ) : (
        <div className={styles.mapSummaryRow}>Legality details available in Premium.</div>
      )}
    </div>
  );
}
