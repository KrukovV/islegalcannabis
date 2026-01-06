"use client";

import { useEffect, useMemo } from "react";
import type { LocationContext } from "@/lib/location/locationContext";
import type { ResultStatusLevel, Source } from "@islegal/shared";
import {
  buildApproxCell,
  loadRecent,
  saveCheck,
  type CachedCheck
} from "@/lib/nearbyCacheStorage";

type RecentResultBadgeProps = {
  jurisdictionKey: string;
  country: string;
  region?: string;
  statusCode: string;
  statusLevel: ResultStatusLevel;
  profileHash: string;
  verifiedAt?: string;
  lawUpdatedAt?: string;
  sources: Source[];
  locationContext?: LocationContext;
  cell?: string | null;
  className?: string;
};

export default function RecentResultBadge({
  jurisdictionKey,
  country,
  region,
  statusCode,
  statusLevel,
  profileHash,
  verifiedAt,
  lawUpdatedAt,
  sources,
  locationContext,
  cell,
  className
}: RecentResultBadgeProps) {
  const approxCell = useMemo(
    () =>
      buildApproxCell({
        method: locationContext?.method,
        country,
        region,
        cell
      }),
    [locationContext?.method, country, region, cell]
  );

  const cacheHit = useMemo(() => {
    if (!locationContext?.method || !locationContext.confidence) {
      return false;
    }
    const lookupCell =
      locationContext.method === "gps" ? approxCell : null;
    const cached = lookupCell
      ? loadRecent(lookupCell, jurisdictionKey)
      : locationContext.method === "gps"
        ? null
        : loadRecent(null, jurisdictionKey);
    return cached?.profileHash === profileHash;
  }, [locationContext, approxCell, jurisdictionKey, profileHash]);

  useEffect(() => {
    if (!locationContext?.method || !locationContext.confidence) {
      return;
    }

    const entry: CachedCheck = {
      ts: new Date().toISOString(),
      jurisdictionKey,
      country,
      region,
      statusCode,
      statusLevel,
      profileHash,
      verifiedAt,
      lawUpdatedAt,
      sources,
      location: {
        method: locationContext.method,
        confidence: locationContext.confidence
      },
      approxCell: approxCell ?? undefined
    };
    saveCheck(entry);
  }, [
    locationContext,
    country,
    region,
    jurisdictionKey,
    profileHash,
    statusCode,
    statusLevel,
    verifiedAt,
    lawUpdatedAt,
    sources,
    approxCell
  ]);

  if (!cacheHit) return null;

  return <p className={className}>Using your recent result</p>;
}
