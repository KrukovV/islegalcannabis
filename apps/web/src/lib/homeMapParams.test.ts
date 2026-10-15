import { describe, expect, it } from "vitest";
import { readHomeMapParams } from "./homeMapParams";

describe("public map URL parameters", () => {
  it("retains camera and GEO deep links before the map mounts", () => {
    expect(readHomeMapParams(new URL("https://www.islegal.info/?lat=-90&lng=180&zoom=15&geo=us-ca"))).toEqual({
      initialMapView: { lat: -90, lng: 180, zoom: 15 }, initialGeoCode: "US-CA",
    });
  });

  it.each(["lat=&lng=0&zoom=1", "lat=91&lng=0&zoom=1", "lat=0&lng=181&zoom=1", "lat=0&lng=0&zoom=16", "lat=NaN&lng=0&zoom=1", "lat=0&lat=1&lng=0&zoom=1"])("rejects incomplete, duplicate or invalid camera: %s", (query) => {
    expect(readHomeMapParams(new URL(`https://www.islegal.info/?${query}`)).initialMapView).toBeNull();
  });

  it("preserves the code alias and rejects duplicate or malformed GEO", () => {
    expect(readHomeMapParams(new URL("https://www.islegal.info/?code=de")).initialGeoCode).toBe("DE");
    expect(readHomeMapParams(new URL("https://www.islegal.info/?geo=de&geo=fr")).initialGeoCode).toBeNull();
    expect(readHomeMapParams(new URL("https://www.islegal.info/?geo=../de")).initialGeoCode).toBeNull();
  });
});
