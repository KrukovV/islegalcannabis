import assert from "node:assert/strict";
import test from "node:test";
import { selectSquarespaceLocationDirectory } from "./fetch_squarespace_location_directory_snapshot.mjs";

function context({ name, address, city, region, postalCode, latitude, longitude }) {
  return `data-context="${JSON.stringify({ location: { addressTitle: name, addressLine1: address, addressLine2: `${city}, ${region}, ${postalCode}`, markerLat: latitude, markerLng: longitude } }).replaceAll('"', '&quot;')}"`;
}

function legacyMapContext({ name, address, city, region, postalCode, latitude, longitude }) {
  return `data-context="${JSON.stringify({ location: { addressTitle: name, addressLine1: `${address}, ${city}, ${region} ${postalCode}`, addressLine2: "Incorrect Hub, EX, 00000", mapLat: latitude, mapLng: longitude } }).replaceAll('"', '&quot;')}"`;
}

function card(name, address, city, region, postalCode) {
  return `<div class="sqs-html-content"><p class="sqsrte-large">${name}</p><p>${address}<br>${city}, ${region} ${postalCode}</p><p>Phone<br>not retained</p></div>`;
}

test("retains official card locations and accepts a coordinate only from the matching published marker", () => {
  const html = `${card("Official Store", "1 Main Rd, Ste 2", "Sample City", "EX", "12345")}<div ${context({ name: "Official Store", address: "1 Main Road, Suite 2", city: "Sample City", region: "EX", postalCode: "12345", latitude: 38.1, longitude: -77.2 })}></div>`;
  const result = selectSquarespaceLocationDirectory(html, { region: "EX", country: "US", expectedCards: 1, expectedMatchedMarkers: 1, expectedUnmatchedMarkers: 0 });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].latitude, 38.1);
  assert.equal(result.records[0].coordinates_confidence, "PROVEN");
  assert.equal(result.records[0].source_record_id.startsWith("squarespace-location:"), true);
});

test("fails closed on a renamed page marker instead of attaching its coordinate to the card", () => {
  const html = `${card("Official Store", "1 Main Street", "Sample City", "EX", "12345")}<div ${context({ name: "Old Store Name", address: "1 Main Street", city: "Sample City", region: "EX", postalCode: "12345", latitude: 38.1, longitude: -77.2 })}></div>`;
  const result = selectSquarespaceLocationDirectory(html, { region: "EX", country: "US", expectedCards: 1, expectedMatchedMarkers: 0, expectedUnmatchedMarkers: 1 });
  assert.equal(result.records[0].latitude, null);
  assert.equal(result.records[0].coordinates_confidence, "UNKNOWN");
});

test("accepts a page marker with complete address-line data and legacy map coordinate keys", () => {
  const html = `${card("Official Store", "1 Main Rd, Suite 2", "Sample City", "EX", "12345")}<div ${legacyMapContext({ name: "Official Store", address: "1 Main Road, Suite 2", city: "Sample City", region: "EX", postalCode: "12345", latitude: 38.1, longitude: -77.2 })}></div>`;
  const result = selectSquarespaceLocationDirectory(html, { region: "EX", country: "US", expectedCards: 1, expectedMatchedMarkers: 1, expectedUnmatchedMarkers: 0 });
  assert.equal(result.records[0].latitude, 38.1);
  assert.equal(result.records[0].longitude, -77.2);
});

test("rejects a changed source count before a snapshot can be written", () => {
  const html = card("Official Store", "1 Main Street", "Sample City", "EX", "12345");
  assert.throws(() => selectSquarespaceLocationDirectory(html, { region: "EX", country: "US", expectedCards: 2 }), /SQUARESPACE_LOCATION_CARD_COUNT_INVALID:1\/2/);
});
