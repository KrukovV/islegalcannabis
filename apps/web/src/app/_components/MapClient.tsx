"use client";

import LeafletMap, { type GeoJsonPayload } from "./LeafletMap";
import type { TruthLevel } from "@/lib/statusUi";
import MapSummary from "./MapSummary";

type Props = {
  geojsonData: GeoJsonPayload;
  stateGeojsonData: GeoJsonPayload;
  regionOptions: Array<{ id: string; name: string; lat: number; lng: number }>;
  statusIndex: Record<
    string,
    {
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
    }
  >;
  mapMode: "CI" | "DEV";
  dataOk: boolean;
  dataSource: string;
  mapEnabled: boolean;
  premiumMode: "FREE" | "PAID";
  nearbyMode: "SKIP" | "RUN";
  showLegality: boolean;
};

export default function MapClient({
  geojsonData,
  stateGeojsonData,
  regionOptions,
  statusIndex,
  mapMode,
  dataOk,
  dataSource,
  mapEnabled,
  premiumMode,
  nearbyMode,
  showLegality
}: Props) {
  const showLeaflet = mapEnabled && mapMode === "DEV";
  return (
    <>
      {showLeaflet ? (
        <LeafletMap
          geojsonData={geojsonData}
          stateGeojsonData={stateGeojsonData}
          regionOptions={regionOptions}
          statusIndex={statusIndex}
          mapMode={mapMode}
          dataSource={dataSource}
          dataOk={dataOk}
        />
      ) : null}
      <MapSummary
        statusIndex={statusIndex}
        mapMode={mapMode}
        dataOk={dataOk}
        dataSource={dataSource}
        mapEnabled={mapEnabled}
        premiumMode={premiumMode}
        nearbyMode={nearbyMode}
        showLegality={showLegality}
      />
    </>
  );
}
