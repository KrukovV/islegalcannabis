import assert from "node:assert/strict";
import test from "node:test";
import { extractCurrentOfficialEmbeddedLicenseRegistry } from "./fetch_current_official_embedded_license_registry.mjs";

function page(payload) {
  return `<script type="application/json" data-drupal-selector="drupal-settings-json">${JSON.stringify({ directory: { jsonData: JSON.stringify(payload) } })}</script>`;
}

test("extracts only current public location fields from a complete official embedded registry", () => {
  const result = extractCurrentOfficialEmbeddedLicenseRegistry({
    html: page({
      totalRecords: 2,
      filteredRecords: 2,
      totalPages: 1,
      pageSize: 2,
      records: [
        { recordId: 1, businessName: "Current Dispensary", businessType: "Dispensary", licenseNumber: "DSPY-001", licenseIssueDate: "2026-01-01", licenseExpirationDate: "2027-01-01", physicalAddress: "1 Main St Example, MS 39000", ownerName: "Must Not Persist", emailAddress: "private@example.test", phoneNumber: "555-0100", mailingAddress: "private" },
        { recordId: 2, businessName: "Expired Dispensary", businessType: "Dispensary", licenseNumber: "DSPY-002", licenseIssueDate: "2024-01-01", licenseExpirationDate: "2025-01-01", physicalAddress: "2 Main St Example, MS 39000" },
      ],
    }),
    settingsPath: "directory.jsonData",
    typeField: "businessType",
    typeValue: "Dispensary",
    now: new Date("2026-08-14T00:00:00.000Z"),
  });
  assert.deepEqual(result.records, [{
    source_record_id: "1",
    business_name: "Current Dispensary",
    business_type: "Dispensary",
    license_number: "DSPY-001",
    license_issue_date: "2026-01-01",
    license_expiration_date: "2027-01-01",
    physical_address: "1 Main St Example, MS 39000",
  }]);
  assert.equal(JSON.stringify(result).includes("private@example.test"), false);
  assert.equal(JSON.stringify(result).includes("Must Not Persist"), false);
});

test("fails closed when the source is not a complete one-page official directory", () => {
  assert.throws(() => extractCurrentOfficialEmbeddedLicenseRegistry({
    html: page({ totalRecords: 2, filteredRecords: 2, totalPages: 2, pageSize: 1, records: [{ recordId: 1 }] }),
    settingsPath: "directory.jsonData",
    typeField: "businessType",
    typeValue: "Dispensary",
    now: new Date("2026-08-14T00:00:00.000Z"),
  }), /EMBEDDED_LICENSE_REGISTRY_NOT_A_COMPLETE_SINGLE_PAGE_DIRECTORY/);
});

test("does not retain a current row that lacks a public licence identifier", () => {
  assert.throws(() => extractCurrentOfficialEmbeddedLicenseRegistry({
    html: page({
      totalRecords: 1,
      filteredRecords: 1,
      totalPages: 1,
      pageSize: 1,
      records: [{ recordId: 1, businessName: "No Licence", businessType: "Dispensary", licenseIssueDate: "2026-01-01", licenseExpirationDate: "2027-01-01", physicalAddress: "1 Main St Example, MS 39000" }],
    }),
    settingsPath: "directory.jsonData",
    typeField: "businessType",
    typeValue: "Dispensary",
    now: new Date("2026-08-14T00:00:00.000Z"),
  }), /EMBEDDED_LICENSE_REGISTRY_CURRENT_SELECTION_EMPTY/);
});
