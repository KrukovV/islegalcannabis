import assert from "node:assert/strict";
import test from "node:test";
import { validateKmlSnapshotResponse } from "./fetch_kml_store_snapshot.mjs";

test("accepts a KML response with at least one placemark", () => {
  const result = validateKmlSnapshotResponse({
    url: "https://regulator.example/map.kml",
    contentType: "application/vnd.google-earth.kml+xml; charset=utf-8",
    body: "<?xml version=\"1.0\"?><kml><Document><Placemark><name>One</name></Placemark></Document></kml>",
  });
  assert.equal(result.placemarks, 1);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
});

test("rejects a non-HTTPS URL, non-KML content type, and non-KML payload", () => {
  assert.throws(() => validateKmlSnapshotResponse({ url: "http://regulator.example/map.kml", contentType: "application/xml", body: "<kml><Placemark/></kml>" }), /HTTPS_REQUIRED/);
  assert.throws(() => validateKmlSnapshotResponse({ url: "https://regulator.example/map.kml", contentType: "text/html", body: "<kml><Placemark/></kml>" }), /CONTENT_TYPE_INVALID/);
  assert.throws(() => validateKmlSnapshotResponse({ url: "https://regulator.example/map.kml", contentType: "application/xml", body: "<html>challenge</html>" }), /PAYLOAD_INVALID/);
});
