import { describe, expect, it } from "vitest";
import { GET } from "./route";
import { loadCanonicalStoreRecords, loadCanonicalLegalTruthByGeo, loadStoreEligibilityByGeo, loadStoreSources, validateStoreVisibility } from "@/lib/storeTruth";

describe("/api/truth-map/stores", () => {
  it("fails malformed viewport queries closed", async () => {
    const response = await GET(new Request("http://localhost/api/truth-map/stores?zoom=10"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_VIEWPORT_QUERY" });
  });

  it("does not request individual stores on the world view", async () => {
    const response = await GET(new Request("http://localhost/api/truth-map/stores?west=-180&south=-90&east=180&north=90&zoom=1"));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.meta.level).toBe("LOW");
    expect(payload.features).toEqual([]);
    expect(payload.meta.estimatedPayloadBytes).toBeGreaterThan(0);
  });

  it("does not return unrelated records for an empty Colorado viewport", async () => {
    const response = await GET(new Request("http://localhost/api/truth-map/stores?west=-109&south=40.9&east=-108&north=41.1&zoom=12"));
    const payload = await response.json();
    expect(payload.meta.level).toBe("LOCAL");
    expect(payload.meta.visibleStores).toBe(0);
    expect(payload.features).toEqual([]);
  });

  it("projects current official active-license locations when hours are not separately published", async () => {
    const response = await GET(new Request("http://localhost/api/truth-map/stores?west=-119&south=33&east=-117&north=35&zoom=12"));
    const payload = await response.json();
    expect(payload.meta.level).toBe("LOCAL");
    const california = payload.features.filter((feature: { properties?: { geo_id?: string } }) => feature.properties?.geo_id === "US-CA");
    expect(california.length).toBeGreaterThan(0);
    expect(california.every((feature: { properties: { license_status?: string; operational_status?: string } }) => feature.properties.license_status === "ACTIVE")).toBe(true);
    expect(california.some((feature: { properties: { operational_status?: string } }) => feature.properties.operational_status === "UNKNOWN_STATUS")).toBe(true);
    expect(california.some((feature: { properties: { operational_status?: string } }) => feature.properties.operational_status === "CLOSED")).toBe(false);
  });

  it("projects an Illinois current licence only after its strict official CROO map join", async () => {
    const response = await GET(new Request("http://localhost/api/truth-map/stores?west=-88.18&south=41.52&east=-88.15&north=41.55&zoom=13"));
    const payload = await response.json();
    const illinois = payload.features.find((feature: { properties?: { store_id?: string } }) => (
      feature.properties?.store_id === "US-IL:LICENSE:284000044-audo"
    ));
    expect(illinois?.properties).toMatchObject({
      geo_id: "US-IL",
      legal_name: "RISE - JOLIET COLORADO AVE.",
      license_number: "284000044-AUDO",
      license_status: "ACTIVE",
      operational_status: "ACTIVE",
      store_type: "ADULT_USE_RETAIL",
      source_authority: "Illinois Department of Financial and Professional Regulation",
    });
  });

  it("keeps a current regulator-listed location visible without inventing an individual active license status", async () => {
    const response = await GET(new Request("http://localhost/api/truth-map/stores?west=-77.33&south=38.83&east=-77.28&north=38.89&zoom=13"));
    const payload = await response.json();
    const virginia = payload.features.find((feature: { properties?: { store_id?: string } }) => (
      feature.properties?.store_id === "US-VA:SOURCE:0c743f46699c7a1795fa0f30"
    ));
    expect(virginia?.properties).toMatchObject({
      geo_id: "US-VA",
      license_status: "UNKNOWN_STATUS",
      operational_status: "UNKNOWN_STATUS",
      store_type: "MEDICAL_DISPENSARY",
      source_authority: "Virginia Cannabis Control Authority",
    });
  });

  it("projects current official Jamaica CLA retail-map features without inventing per-store lifecycle", async () => {
    const record = loadCanonicalStoreRecords().find((item) => item.source_id === "official-jm-cla-current-licensed-retail-store-map-2026-08-20");
    const source = loadStoreSources().find((item) => item.source_id === record?.source_id);
    expect(record).toBeDefined();
    expect(validateStoreVisibility(
      record!,
      source,
      loadCanonicalLegalTruthByGeo().get("JM"),
      loadStoreEligibilityByGeo().get("JM"),
    ).reasons).toEqual([]);
    const response = await GET(new Request("http://localhost/api/truth-map/stores?west=-77.2&south=17.9&east=-76.7&north=18.5&zoom=12"));
    const payload = await response.json();
    const jamaica = payload.features
      .filter((feature: { properties?: { geo_id?: string } }) => feature.properties?.geo_id === "JM")
      .map((feature: { properties: { legal_name?: string; license_status?: string; operational_status?: string; store_type?: string; source_authority?: string } }) => feature.properties);
    expect(jamaica.map((store: { legal_name?: string }) => store.legal_name).sort()).toEqual([
      "Jacana Manor Park",
      "Jacana New Kingston",
      "Jacana Ocho Rios",
    ]);
    expect(jamaica.every((store: { license_status?: string; operational_status?: string; store_type?: string; source_authority?: string }) => (
      store.license_status === "UNKNOWN_STATUS" &&
      store.operational_status === "UNKNOWN_STATUS" &&
      store.store_type === "ADULT_USE_RETAIL" &&
      store.source_authority === "Cannabis Licensing Authority of Jamaica, Ministry of Industry, Investment and Commerce"
    ))).toBe(true);
  });

  it("projects the current Vermont CCB retailer map without inventing per-store lifecycle", async () => {
    const record = loadCanonicalStoreRecords().find((item) => (
      item.source_id === "official-us-vt-ccb-current-licensed-retailers-2026-08-21"
      && item.legal_name === "Mountain Girl Cannabis, Inc."
    ));
    const source = loadStoreSources().find((item) => item.source_id === record?.source_id);
    expect(record).toBeDefined();
    expect(validateStoreVisibility(
      record!,
      source,
      loadCanonicalLegalTruthByGeo().get("US-VT"),
      loadStoreEligibilityByGeo().get("US-VT"),
    ).reasons).toEqual([]);

    const response = await GET(new Request("http://localhost/api/truth-map/stores?west=-73.02&south=43.57&east=-72.95&north=43.64&zoom=13"));
    const payload = await response.json();
    const vermont = payload.features.find((feature: { properties?: { store_id?: string } }) => (
      feature.properties?.store_id === record?.canonical_store_id
    ));
    expect(vermont?.properties).toMatchObject({
      geo_id: "US-VT",
      legal_name: "Mountain Girl Cannabis, Inc.",
      license_status: "UNKNOWN_STATUS",
      operational_status: "UNKNOWN_STATUS",
      store_type: "ADULT_USE_RETAIL",
      source_authority: "Vermont Cannabis Control Board",
    });
  });

  it("projects SHA-bound exact Census coordinates for current Virginia CCA cards", async () => {
    const response = await GET(new Request("http://localhost/api/truth-map/stores?west=-82.24&south=36.58&east=-82.20&north=36.62&zoom=13"));
    const payload = await response.json();
    const virginia = payload.features.find((feature: { properties?: { store_id?: string } }) => (
      feature.properties?.store_id === "US-VA:SOURCE:c5505b07479037302d108de5"
    ));
    expect(virginia?.properties).toMatchObject({
      geo_id: "US-VA",
      legal_name: "RISE Bristol",
      license_status: "UNKNOWN_STATUS",
      operational_status: "UNKNOWN_STATUS",
      store_type: "MEDICAL_DISPENSARY",
      source_authority: "Virginia Cannabis Control Authority",
    });
  });

  it("projects a newly exact-geocoded Virginia CCA card without inventing its status", async () => {
    const response = await GET(new Request("http://localhost/api/truth-map/stores?west=-76.30&south=36.89&east=-76.24&north=36.94&zoom=13"));
    const payload = await response.json();
    const virginia = payload.features.find((feature: { properties?: { store_id?: string } }) => (
      feature.properties?.store_id === "US-VA:SOURCE:529be67fd0bbab169177d08c"
    ));
    expect(virginia?.properties).toMatchObject({
      geo_id: "US-VA",
      legal_name: "Zen Leaf Norfolk",
      license_status: "UNKNOWN_STATUS",
      operational_status: "UNKNOWN_STATUS",
      store_type: "MEDICAL_DISPENSARY",
      source_authority: "Virginia Cannabis Control Authority",
    });
  });

  it("projects a current active Michigan CRA retailer only after the exact Census gate", async () => {
    const response = await GET(new Request("http://localhost/api/truth-map/stores?west=-84.37&south=41.97&east=-84.33&north=42.00&zoom=13"));
    const payload = await response.json();
    const michigan = payload.features.find((feature: { properties?: { store_id?: string } }) => (
      feature.properties?.store_id === "US-MI:LICENSE:au-r-001591"
    ));
    expect(michigan?.properties).toMatchObject({
      geo_id: "US-MI",
      legal_name: "Better Buds, LLC",
      license_number: "AU-R-001591",
      license_status: "ACTIVE",
      operational_status: "UNKNOWN_STATUS",
      store_type: "ADULT_USE_RETAIL",
      source_authority: "Michigan Cannabis Regulatory Agency",
    });
  });

  it("keeps an explicitly void Michigan CRA licence off the map even when its address geocodes exactly", async () => {
    const response = await GET(new Request("http://localhost/api/truth-map/stores?west=-83.75&south=42.21&east=-83.70&north=42.25&zoom=13"));
    const payload = await response.json();
    expect(payload.features.some((feature: { properties?: { store_id?: string } }) => (
      feature.properties?.store_id === "US-MI:LICENSE:au-r-000100"
    ))).toBe(false);
  });

  it("projects a current DHSS verified Missouri dispensary without inventing a per-location status", async () => {
    const response = await GET(new Request("http://localhost/api/truth-map/stores?west=-89.58&south=37.27&east=-89.54&north=37.32&zoom=13"));
    const payload = await response.json();
    const missouri = payload.features.find((feature: { properties?: { store_id?: string } }) => (
      feature.properties?.store_id === "US-MO:LICENSE:dis000143"
    ));
    expect(missouri?.properties).toMatchObject({
      geo_id: "US-MO",
      legal_name: "High Profile Cannabis Shop; High Profile",
      license_number: "DIS000143",
      license_status: "UNKNOWN_STATUS",
      operational_status: "UNKNOWN_STATUS",
      store_type: "ADULT_USE_RETAIL",
      source_authority: "Missouri Department of Health and Senior Services, Division of Cannabis Regulation",
    });
  });

  it("projects a current Mississippi MMCP dispensary only after the SHA-bound exact government-coordinate gate", async () => {
    const response = await GET(new Request("http://localhost/api/truth-map/stores?west=-90.06&south=32.57&east=-90.02&north=32.61&zoom=13"));
    const payload = await response.json();
    const mississippi = payload.features.find((feature: { properties?: { store_id?: string } }) => (
      feature.properties?.store_id === "US-MS:LICENSE:dspy001345"
    ));
    expect(mississippi?.properties).toMatchObject({
      geo_id: "US-MS",
      legal_name: "Green Magnolia of Canton, LLC",
      license_number: "DSPY001345",
      license_status: "UNKNOWN_STATUS",
      operational_status: "UNKNOWN_STATUS",
      store_type: "MEDICAL_DISPENSARY",
      source_authority: "Mississippi State Department of Health, Mississippi Medical Cannabis Program",
    });
  });

  it("projects only SHA-bound exact Census points from the current Rhode Island CCC licensed-center table", async () => {
    const response = await GET(new Request("http://localhost/api/truth-map/stores?west=-71.44&south=41.82&east=-71.39&north=41.86&zoom=13"));
    const payload = await response.json();
    const rhodeIsland = payload.features.find((feature: { properties?: { store_id?: string } }) => (
      feature.properties?.store_id === "US-RI:LICENSE_LOCATION:mmp-cc-001:7716523ee536ce2d78acb405"
    ));
    expect(rhodeIsland?.properties).toMatchObject({
      geo_id: "US-RI",
      legal_name: "Thomas C. Slater Compassion Center",
      license_number: "MMP CC 001",
      license_status: "UNKNOWN_STATUS",
      operational_status: "UNKNOWN_STATUS",
      store_type: "ADULT_USE_RETAIL",
      source_authority: "Rhode Island Cannabis Control Commission",
    });
    expect(payload.features.some((feature: { properties?: { license_number?: string } }) => feature.properties?.license_number === "MMP CC 002")).toBe(false);
  });

  it("projects all exact government-geocoded current North Dakota locations without inventing a licence status", async () => {
    const response = await GET(new Request("http://localhost/api/truth-map/stores?west=-97.08&south=47.92&east=-97.03&north=47.95&zoom=13"));
    const payload = await response.json();
    const northDakota = payload.features.find((feature: { properties?: { store_id?: string } }) => (
      feature.properties?.store_id === "US-ND:ENTITY:3acd26c331050a60ec3aca27"
    ));
    expect(northDakota?.properties).toMatchObject({
      geo_id: "US-ND",
      license_status: "UNKNOWN_STATUS",
      operational_status: "ACTIVE",
      store_type: "MEDICAL_DISPENSARY",
      source_authority: "North Dakota Health and Human Services, Medical Marijuana Program",
    });
  });

  it("projects a newly exact-geocoded North Dakota HHS address only under the no-source-ZIP policy", async () => {
    const response = await GET(new Request("http://localhost/api/truth-map/stores?west=-100.84&south=46.79&east=-100.79&north=46.83&zoom=13"));
    const payload = await response.json();
    const northDakota = payload.features.find((feature: { properties?: { store_id?: string } }) => (
      feature.properties?.store_id === "US-ND:ENTITY:852de64c160545e860207dcd"
    ));
    expect(northDakota?.properties).toMatchObject({
      geo_id: "US-ND",
      legal_name: "Pure Dakota Health of Bismarck",
      license_status: "UNKNOWN_STATUS",
      operational_status: "ACTIVE",
      store_type: "MEDICAL_DISPENSARY",
      source_authority: "North Dakota Health and Human Services, Medical Marijuana Program",
    });
  });

  it("projects only SHA-bound exact Census points from the current Colorado MED store registry", async () => {
    const response = await GET(new Request("http://localhost/api/truth-map/stores?west=-105.04&south=39.75&east=-105.01&north=39.79&zoom=13"));
    const payload = await response.json();
    const colorado = payload.features.find((feature: { properties?: { store_id?: string } }) => (
      feature.properties?.store_id === "US-CO:LICENSE:402-00041"
    ));
    expect(colorado?.properties).toMatchObject({
      geo_id: "US-CO",
      legal_name: "HG LTD",
      license_number: "402-00041",
      license_status: "UNKNOWN_STATUS",
      operational_status: "UNKNOWN_STATUS",
      store_type: "MEDICAL_DISPENSARY",
      source_authority: "Colorado Department of Revenue, Marijuana Enforcement Division",
    });
  });

  it("does not project location-free Hawaii regulator directory names as map pins", async () => {
    const response = await GET(new Request("http://localhost/api/truth-map/stores?west=-157.95&south=21.24&east=-157.76&north=21.38&zoom=13"));
    const payload = await response.json();
    expect(payload.meta.level).toBe("LOCAL");
    expect(payload.features.some((feature: { properties?: { geo_id?: string } }) => feature.properties?.geo_id === "US-HI")).toBe(false);
  });

  it("keeps current Yukon licensed-retailer records out of the map without exact official coordinates and country-scope eligibility", async () => {
    const response = await GET(new Request("http://localhost/api/truth-map/stores?west=-135.12&south=60.68&east=-134.98&north=60.76&zoom=13"));
    const payload = await response.json();
    expect(payload.meta.level).toBe("LOCAL");
    expect(payload.features.some((feature: { properties?: { geo_id?: string } }) => feature.properties?.geo_id === "CA")).toBe(false);
  });

  it("projects only the SHA-bound exact City of Calgary Parcel points from the current AGLC retailer source", async () => {
    const response = await GET(new Request("http://localhost/api/truth-map/stores?west=-114.22&south=50.90&east=-113.92&north=51.20&zoom=13"));
    const payload = await response.json();
    expect(payload.meta.level).toBe("LOCAL");
    const alberta = payload.features.filter((feature: { properties?: { geo_id?: string; source_authority?: string } }) => (
      feature.properties?.geo_id === "CA" &&
      feature.properties?.source_authority === "Alberta Gaming, Liquor and Cannabis"
    ));
    expect(alberta).toHaveLength(15);
    expect(alberta.every((feature: { properties?: { license_status?: string; operational_status?: string } }) => (
      feature.properties?.license_status === "UNKNOWN_STATUS" &&
      feature.properties?.operational_status === "UNKNOWN_STATUS"
    ))).toBe(true);
    expect(alberta.some((feature: { properties?: { store_id?: string } }) => (
      feature.properties?.store_id === "CA:SOURCE:8eb9562d211703b5d4de4d57"
    ))).toBe(true);
  });

  it("projects a current active Maine retailer only after the explicit no-source-ZIP exact coordinate gate", async () => {
    const response = await GET(new Request("http://localhost/api/truth-map/stores?west=-69.88&south=44.31&east=-69.83&north=44.34&zoom=13"));
    const payload = await response.json();
    const maine = payload.features.find((feature: { properties?: { store_id?: string } }) => (
      feature.properties?.store_id === "US-ME:LICENSE:ams102"
    ));
    expect(maine?.properties).toMatchObject({
      geo_id: "US-ME",
      legal_name: "ORIGINS CANNABIS COMPANY LLC",
      license_number: "AMS102",
      license_status: "ACTIVE",
      operational_status: "ACTIVE",
      store_type: "ADULT_USE_RETAIL",
      source_authority: "Maine Department of Administrative and Financial Services, Office of Cannabis Policy",
    });
  });

  it("projects a newly exact-geocoded Maine active retailer under the same no-source-ZIP policy", async () => {
    const response = await GET(new Request("http://localhost/api/truth-map/stores?west=-70.29&south=43.64&east=-70.24&north=43.68&zoom=13"));
    const payload = await response.json();
    const maine = payload.features.find((feature: { properties?: { store_id?: string } }) => (
      feature.properties?.store_id === "US-ME:LICENSE:ams110"
    ));
    expect(maine?.properties).toMatchObject({
      geo_id: "US-ME",
      legal_name: "SEA LEVEL WEED CO.",
      license_number: "AMS110",
      license_status: "ACTIVE",
      operational_status: "ACTIVE",
      store_type: "ADULT_USE_RETAIL",
      source_authority: "Maine Department of Administrative and Financial Services, Office of Cannabis Policy",
    });
  });

  it("projects a current Minnesota OCM adult-use retail site only after the SHA-bound exact Census gate", async () => {
    const response = await GET(new Request("http://localhost/api/truth-map/stores?west=-93.64&south=44.92&east=-93.58&north=44.95&zoom=13"));
    const payload = await response.json();
    const minnesota = payload.features.find((feature: { properties?: { store_id?: string } }) => (
      feature.properties?.store_id === "US-MN:LICENSE_LOCATION:dis-l24-000039:b5e93f01105a219af4bd4aa8"
    ));
    expect(minnesota?.properties).toMatchObject({
      geo_id: "US-MN",
      legal_name: "Mohamed Shawky DBA Sufic Sorcery",
      trade_name: "The Joint Dispensary",
      license_number: "DIS-L24-000039",
      license_status: "ACTIVE",
      operational_status: "ACTIVE",
      store_type: "ADULT_USE_RETAIL",
      source_authority: "Minnesota Office of Cannabis Management",
    });
  });

  it("projects only SHA-bound exact Louisiana LDH medical-retailer locations without inventing an active or open status", async () => {
    const response = await GET(new Request("http://localhost/api/truth-map/stores?west=-94.1&south=28.8&east=-88.7&north=33.1&zoom=12"));
    const payload = await response.json();
    expect(payload.meta.level).toBe("LOCAL");
    const louisiana = payload.features.filter((feature: { properties?: { geo_id?: string } }) => feature.properties?.geo_id === "US-LA");
    expect(louisiana).toHaveLength(21);
    expect(louisiana.every((feature: { properties: { license_status?: string; operational_status?: string; store_type?: string; source_authority?: string } }) => (
      feature.properties.license_status === "UNKNOWN_STATUS" &&
      feature.properties.operational_status === "UNKNOWN_STATUS" &&
      feature.properties.store_type === "MEDICAL_DISPENSARY" &&
      feature.properties.source_authority === "Louisiana Department of Health, Cannabis Program"
    ))).toBe(true);
    expect(louisiana.some((feature: { properties: { address?: string } }) => feature.properties.address === "1667 Tchoupitoulas Blvd., Suite B, New Orleans, LA 70130")).toBe(false);
  });

  it("keeps a certificate-blocked Antigua regulator directory local until direct C3 review succeeds", async () => {
    const response = await GET(new Request("http://localhost/api/truth-map/stores?west=-61.9&south=17.0&east=-61.6&north=17.25&zoom=13"));
    const payload = await response.json();
    expect(payload.meta.level).toBe("LOCAL");
    expect(payload.features.some((feature: { properties?: { geo_id?: string } }) => feature.properties?.geo_id === "AG")).toBe(false);
  });

  it("projects only current PA Department of Health product-available dispensaries", async () => {
    const response = await GET(new Request("http://localhost/api/truth-map/stores?west=-75.3&south=39.85&east=-75.0&north=40.08&zoom=12"));
    const payload = await response.json();
    expect(payload.meta.level).toBe("LOCAL");
    const pennsylvania = payload.features.filter((feature: { properties?: { geo_id?: string } }) => feature.properties?.geo_id === "US-PA");
    expect(pennsylvania.length).toBeGreaterThan(0);
    expect(pennsylvania.every((feature: { properties: { license_status?: string; operational_status?: string; store_type?: string; source_authority?: string } }) => (
      feature.properties.license_status === "ACTIVE" &&
      feature.properties.operational_status === "ACTIVE" &&
      feature.properties.store_type === "MEDICAL_DISPENSARY" &&
      feature.properties.source_authority === "Pennsylvania Department of Health"
    ))).toBe(true);
  });

  it("projects only one-to-one government-geocoded current Delaware regulator-directory locations", async () => {
    const response = await GET(new Request("http://localhost/api/truth-map/stores?west=-75.8&south=38.4&east=-75.0&north=39.9&zoom=12"));
    const payload = await response.json();
    expect(payload.meta.level).toBe("LOCAL");
    const delaware = payload.features.filter((feature: { properties?: { geo_id?: string } }) => feature.properties?.geo_id === "US-DE");
    expect(delaware).toHaveLength(12);
    expect(delaware.every((feature: { properties: { license_status?: string; operational_status?: string; store_type?: string; source_authority?: string } }) => (
      feature.properties.license_status === "ACTIVE" &&
      feature.properties.operational_status === "ACTIVE" &&
      feature.properties.store_type === "ADULT_USE_RETAIL" &&
      feature.properties.source_authority === "State of Delaware, Office of the Marijuana Commissioner"
    ))).toBe(true);
    expect(delaware.some((feature: { properties: { address?: string } }) => feature.properties.address === "800 Ogletown Rd")).toBe(false);
    expect(delaware.some((feature: { properties: { address?: string } }) => feature.properties.address === "22982 Sussex Hwy")).toBe(false);
  });

  it("projects only SHA-bound exact Census coordinates from the current New Hampshire DHHS operating-ATC directory", async () => {
    const response = await GET(new Request("http://localhost/api/truth-map/stores?west=-72.56&south=42.70&east=-70.57&north=45.31&zoom=12"));
    const payload = await response.json();
    expect(payload.meta.level).toBe("LOCAL");
    const newHampshire = payload.features.filter((feature: { properties?: { geo_id?: string } }) => feature.properties?.geo_id === "US-NH");
    expect(newHampshire).toHaveLength(2);
    expect(newHampshire.map((feature: { properties: { address?: string } }) => feature.properties.address).sort()).toEqual([
      "234 White Mountain Highway",
      "69 Island Street, Suite 1",
    ]);
    expect(newHampshire.every((feature: { properties: { license_status?: string; operational_status?: string; store_type?: string; source_authority?: string } }) => (
      feature.properties.license_status === "UNKNOWN_STATUS" &&
      feature.properties.operational_status === "ACTIVE" &&
      feature.properties.store_type === "MEDICAL_DISPENSARY" &&
      feature.properties.source_authority === "New Hampshire Department of Health and Human Services, Therapeutic Cannabis Program"
    ))).toBe(true);
    expect(newHampshire.some((feature: { properties: { address?: string } }) => feature.properties.address === "380 Daniel Webster Highway, Units A and C")).toBe(false);
  });

  it("projects only SHA-bound exact Census points from the current Kentucky OMC open-dispensary list", async () => {
    const response = await GET(new Request("http://localhost/api/truth-map/stores?west=-89.58&south=36.49&east=-81.96&north=39.15&zoom=12"));
    const payload = await response.json();
    expect(payload.meta.level).toBe("LOCAL");
    const kentucky = payload.features.filter((feature: { properties?: { geo_id?: string } }) => feature.properties?.geo_id === "US-KY");
    expect(kentucky).toHaveLength(12);
    expect(kentucky.some((feature: { properties?: { store_id?: string } }) => (
      feature.properties?.store_id === "US-KY:ENTITY:09c74cd617ae99c46a8db451"
    ))).toBe(true);
    expect(kentucky.every((feature: { properties: { license_status?: string; operational_status?: string; store_type?: string; source_authority?: string } }) => (
      feature.properties.license_status === "ACTIVE" &&
      feature.properties.operational_status === "ACTIVE" &&
      feature.properties.store_type === "MEDICAL_DISPENSARY" &&
      feature.properties.source_authority === "Kentucky Cabinet for Health and Family Services, Office of Medical Cannabis"
    ))).toBe(true);
  });

  it("projects the current AMCC-confirmed Alabama dispensary only after its SHA-bound exact Census match", async () => {
    const response = await GET(new Request("http://localhost/api/truth-map/stores?west=-86.24&south=32.36&east=-86.20&north=32.40&zoom=13"));
    const payload = await response.json();
    const alabama = payload.features.find((feature: { properties?: { store_id?: string } }) => (
      feature.properties?.store_id === "US-AL:SOURCE:e1eb23cb822b6bd622151893"
    ));
    expect(alabama?.properties).toMatchObject({
      geo_id: "US-AL",
      legal_name: "Callie's Apothecary",
      license_status: "UNKNOWN_STATUS",
      operational_status: "ACTIVE",
      store_type: "MEDICAL_DISPENSARY",
      source_authority: "Alabama Medical Cannabis Commission",
    });
  });
});
