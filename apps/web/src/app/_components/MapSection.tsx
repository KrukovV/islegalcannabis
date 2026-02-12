import { isCi, isMapEnabled } from "@/lib/env";
import { buildGeoJson, buildRegions, buildSSOTStatusIndex } from "@/lib/mapData";
import MapSummary from "./MapSummary";
import MapClient from "./MapClient";

export default function MapSection() {
  const mapMode = isCi() ? "CI" : "DEV";
  const isPremium =
    process.env.NEXT_PUBLIC_PREMIUM === "1" || process.env.PREMIUM === "1";
  const premiumMode = isPremium ? "PAID" : "FREE";
  const nearbyMode = isPremium ? "RUN" : "SKIP";
  const regions = buildRegions();
  const statusIndexMap = buildSSOTStatusIndex(regions);
  const geojsonData = buildGeoJson("countries");
  const stateGeojsonData = buildGeoJson("states");
  const dataOk = regions.length >= 16 && geojsonData.features.length >= 16;
  const mapTiles = process.env.NO_TILE_NETWORK === "1" ? "OFFLINE" : "NETWORK";
  const dataSource = mapTiles === "OFFLINE" ? "SSOT_TILES_OFFLINE" : "SSOT";
  const mapEnabled = isMapEnabled() && isPremium;
  const showLeaflet = mapEnabled && mapMode === "DEV";
  const nameIndex = new Map(regions.map((entry) => [entry.geo, entry.name || entry.geo]));
  const statusIndex = Object.fromEntries(
    Array.from(statusIndexMap.entries()).map(([geo, entry]) => [
      geo,
      {
        geo: entry.geoKey,
        name: nameIndex.get(geo) || entry.geoKey,
        recEffective: entry.recEffective,
        medEffective: entry.medEffective,
        recDerived: entry.recDerived,
        medDerived: entry.medDerived,
        truthLevel: entry.truthLevel,
        officialOverride: entry.officialOverride,
        officialLinksCount: entry.officialLinksCount,
        reasons: entry.reasons,
        wikiPage: entry.wikiPage || null,
        sources: entry.sources
      }
    ])
  );
  const leafletAssets = showLeaflet ? <script src="/vendor/leaflet/leaflet.js" defer /> : null;

  if (!dataOk) {
    return (
      <div>
        {leafletAssets}
        <h2>Map data unavailable</h2>
        <MapSummary
          statusIndex={statusIndex}
          mapMode={mapMode}
          dataOk={dataOk}
          dataSource={dataSource}
          mapEnabled={false}
          premiumMode={premiumMode}
          nearbyMode={nearbyMode}
          showLegality={isPremium}
        />
      </div>
    );
  }

  if (!mapEnabled) {
    return (
      <div>
        {leafletAssets}
        {mapMode === "CI" ? (
          <h2>Map disabled in CI</h2>
        ) : (
          <h2>Map available in Premium</h2>
        )}
        <p>Set PREMIUM=1 and MAP_ENABLED=1 to render the interactive map locally.</p>
        <MapSummary
          statusIndex={statusIndex}
          mapMode={mapMode}
          dataOk={dataOk}
          dataSource={dataSource}
          mapEnabled={false}
          premiumMode={premiumMode}
          nearbyMode={nearbyMode}
          showLegality={isPremium}
        />
      </div>
    );
  }

  return (
    <>
      {leafletAssets}
      <MapClient
        geojsonData={geojsonData}
        stateGeojsonData={stateGeojsonData}
        regionOptions={regions
          .filter((entry) => entry.coordinates)
          .map((entry) => ({
            id: entry.geo,
            name: entry.name || entry.geo,
            lat: entry.coordinates!.lat,
            lng: entry.coordinates!.lng
          }))
          .sort((a, b) => a.name.localeCompare(b.name))}
        statusIndex={statusIndex}
        mapMode={mapMode}
        dataOk={dataOk}
        dataSource={dataSource}
        mapEnabled={mapEnabled}
        premiumMode={premiumMode}
        nearbyMode={nearbyMode}
        showLegality={isPremium}
      />
    </>
  );
}
