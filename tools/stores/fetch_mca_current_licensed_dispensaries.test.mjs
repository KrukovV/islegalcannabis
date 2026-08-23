import assert from "node:assert/strict";
import test from "node:test";
import { selectMcaCurrentLicensedDispensaries } from "./fetch_mca_current_licensed_dispensaries.mjs";

const appId = "51f75b68c70f4c6d8ab0aa4f4de74f55";
const featureServiceUrl = "https://services.arcgis.com/njFNhDsUCentVYJW/arcgis/rest/services/MCA_Licensed_Dispensaries_List_view_API/FeatureServer";

function locatorHtml() {
  return `<h2>Find a Licensed Dispensary <a href="https&#58;//maryland.maps.arcgis.com/apps/instant/basic/index.html?appid=${appId}">View Dispensary Map</a></h2><em>Updated 8/12/2026</em>`;
}

function appData() {
  return {
    values: {
      webmap: "0e70d594abe340208470efe620052a11",
      mapA11yDesc: "The Maryland Cannabis Administration has issued licenses for the Adult-Use and Medical Marketplaces to the dispensaries shown on this map.",
      searchConfiguration: {
        sources: [{
          name: "Licensed Dispensaries",
          layer: { url: featureServiceUrl },
          popupTemplate: { title: "MCA Licensed Dispensaries List: {name}" },
        }],
      },
    },
  };
}

function feature(overrides = {}) {
  return {
    attributes: {
      lat: 39.2916655,
      long: -76.5123836,
      name: "Vireo of Charm City, LLC",
      dba: "Green Goods - Baltimore (Dundalk)",
      license_number: "DA-23-00070",
      au_med: "Medical & Adult-Use",
      Address: "717 North Point Boulevard",
      Address_2: null,
      City: "Baltimore",
      State: "Maryland",
      Zip: 21224,
      Licensee_Type: "Med-AU Conversion Licensee",
      ObjectId: 1,
      ...overrides.attributes,
    },
    geometry: { x: -76.5123836, y: 39.2916655, ...overrides.geometry },
  };
}

function source(features = [feature()]) {
  return {
    locatorHtml: locatorHtml(),
    appData: appData(),
    featureSet: { features },
    expectedAppId: appId,
    expectedFeatureServiceUrl: featureServiceUrl,
  };
}

test("retains an MCA current licensed dispensary with its official feature geometry", () => {
  const result = selectMcaCurrentLicensedDispensaries(source());
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].license_status, "ACTIVE");
  assert.equal(result.records[0].operational_status, "UNKNOWN_STATUS");
  assert.equal(result.records[0].store_type, "ADULT_USE_RETAIL");
  assert.equal(result.records[0].public_source_fields.current_license_status, "LISTED_ON_CURRENT_MCA_LICENSED_DISPENSARY_MAP");
  assert.equal(result.locator_updated_label, "Updated 8/12/2026");
});

test("rejects a locator that does not point to the official MCA map app", () => {
  assert.throws(() => selectMcaCurrentLicensedDispensaries({ ...source(), locatorHtml: locatorHtml().replace(appId, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa") }), /LOCATOR_APP_ID_MISMATCH/);
});

test("blocks a feature with a coordinate outside the Maryland envelope", () => {
  const outsideMaryland = feature({ geometry: { x: -71.0589, y: 42.3601 } });
  assert.throws(() => selectMcaCurrentLicensedDispensaries(source([outsideMaryland])), /SELECTION_EMPTY/);
});

test("rejects multiple distinct current locations for one MCA licence", () => {
  const relocated = feature({ attributes: { ObjectId: 2, Address: "42 New Address", license_number: "DA-23-00070" }, geometry: { x: -76.4, y: 39.3 } });
  assert.throws(() => selectMcaCurrentLicensedDispensaries(source([feature(), relocated])), /LICENSE_CONFLICT/);
});
