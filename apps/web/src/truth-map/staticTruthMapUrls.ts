import manifest from "./static-assets/manifest.json";

const countriesHash = manifest.assets.countries.hash;
const usStatesHash = manifest.assets["us-states"].hash;

if (
  manifest.schemaVersion !== 1
  || !/^[a-f0-9]{12}$/.test(countriesHash)
  || !/^[a-f0-9]{12}$/.test(usStatesHash)
) {
  throw new Error("STATIC_TRUTH_MAP_MANIFEST_INVALID");
}

// Browser-safe URLs only. Asset bytes and integrity checks stay on the server.
export const STATIC_TRUTH_MAP_COUNTRIES_URL = `/static/truth-map/countries.${countriesHash}.json.br`;
export const STATIC_TRUTH_MAP_US_STATES_URL = `/static/truth-map/us-states.${usStatesHash}.json.br`;
