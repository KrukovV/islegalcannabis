import assert from "node:assert/strict";
import test from "node:test";
import { buildStoreSourceCandidates } from "./build_store_source_candidates.mjs";

function row(geo, truthColor) {
  return {
    geo,
    truthColor,
    legalInterpretation: { medical: "MEDICAL CANNABIS DISPENSARY LICENSING" },
    primaryLaw: {
      officialSources: [{
        title: "Official cannabis dispensary licence directory",
        url: `https://regulator.example.gov/${geo}/registry.json`,
        sourceOwnerGeo: geo,
        appliesToGeos: [geo],
        officialPublisher: "Example regulator",
        cannabisSpecific: true,
      }],
    },
  };
}

function sourceRow(geo, truthColor, source) {
  return {
    geo,
    truthColor,
    legalInterpretation: { medical: "MEDICAL CANNABIS DISPENSARY LICENSING" },
    primaryLaw: { officialSources: [source] },
  };
}

test("store source discovery queues only legally eligible GEO", () => {
  const rows = Array.from({ length: 307 }, (_, index) => row(`X${String(index).padStart(3, "0")}`, "RED"));
  rows[0] = row("US-CO", "GREEN");
  rows[1] = row("US-PA", "YELLOW");
  rows[2] = row("GE", "UNKNOWN");
  rows[3] = row("US-GA", "RED");
  const candidates = buildStoreSourceCandidates({ rows });
  assert.deepEqual(candidates.map((candidate) => candidate.geo_id), ["US-CO", "US-PA"]);
  assert.ok(candidates.every((candidate) => candidate.status === "NEEDS_REVIEW"));
  assert.ok(candidates.every((candidate) => candidate.source_classification === "NEEDS_REVIEW"));
  assert.ok(candidates.every((candidate) => candidate.store_type_candidates.includes("OTHER_REGULATED_POINT")));
  assert.ok(candidates.every((candidate) => candidate.evidence.store_semantics_match === "CANDIDATE_LICENSED_LOCATION_DATA"));
});

test("does not turn prescription or dispensing law into a store-registry lead", () => {
  const candidates = buildStoreSourceCandidates({ rows: Array.from({ length: 307 }, (_, index) =>
    sourceRow(`X${String(index).padStart(3, "0")}`, "YELLOW", {
      title: "Government cannabis prescription and pharmacy dispensing regulation",
      url: `https://laws.example.gov/${index}/cannabis-regulation.pdf`,
      sourceOwnerGeo: `X${String(index).padStart(3, "0")}`,
      appliesToGeos: [`X${String(index).padStart(3, "0")}`],
      officialPublisher: "Example government",
      cannabisSpecific: true,
    }),
  ) });
  assert.deepEqual(candidates, []);
});

test("does not use legal-review prose to turn a primary narcotics law into a registry lead", () => {
  const candidates = buildStoreSourceCandidates({ rows: Array.from({ length: 307 }, (_, index) =>
    sourceRow(`X${String(index).padStart(3, "0")}`, "YELLOW", {
      title: "Narcotics Control Act 2018",
      url: `https://laws.example.gov/${index}/act.pdf`,
      sourceOwnerGeo: `X${String(index).padStart(3, "0")}`,
      appliesToGeos: [`X${String(index).padStart(3, "0")}`],
      officialPublisher: "Example government",
      sourceKind: "CURRENT_PRIMARY_NARCOTICS_CONTROL_ACT",
      primaryOrContext: "PRIMARY",
      cannabisSpecific: true,
      visualReview: "The legal review mentions a licensed cannabis dispensary directory and pharmacy route.",
    }),
  ) });
  assert.deepEqual(candidates, []);
});

test("queues an explicit regulator directory without borrowing legal-analysis prose", () => {
  const rows = Array.from({ length: 307 }, (_, index) => row(`X${String(index).padStart(3, "0")}`, "RED"));
  rows[0] = sourceRow("US-HI", "GREEN", {
    title: "Medical Cannabis Registry Program - Dispensary Directory",
    url: "https://regulator.example.gov/US-HI/dispensary-directory",
    sourceOwnerGeo: "US-HI",
    appliesToGeos: ["US-HI"],
    officialPublisher: "State cannabis regulator",
    sourceKind: "CURRENT_STATE_REGULATOR_DISPENSARY_DIRECTORY",
    primaryOrContext: "OPERATIONAL_LEAD",
    cannabisSpecific: true,
    visualReview: "Unrelated legal review text must not be needed for discovery.",
  });
  const [candidate] = buildStoreSourceCandidates({ rows });
  assert.equal(candidate.geo_id, "US-HI");
  assert.deepEqual(candidate.store_type_candidates, ["MEDICAL_DISPENSARY"]);
  assert.equal(candidate.provenance.source_kind, "CURRENT_STATE_REGULATOR_DISPENSARY_DIRECTORY");
});

test("does not treat licences, applications, guidance, or market statistics as a location inventory", () => {
  const rows = Array.from({ length: 307 }, (_, index) => row(`X${String(index).padStart(3, "0")}`, "RED"));
  rows[0] = sourceRow("US-AK", "GREEN", {
    title: "Completed applications for marijuana establishment licences",
    url: "https://regulator.example.gov/US-AK/completed-applications",
    sourceOwnerGeo: "US-AK",
    appliesToGeos: ["US-AK"],
    officialPublisher: "State cannabis regulator",
    sourceKind: "CURRENT_OFFICIAL_REGULATOR_LICENSING_PAGE",
    primaryOrContext: "OPERATIONAL_LEAD",
    cannabisSpecific: true,
  });
  assert.deepEqual(buildStoreSourceCandidates({ rows }), []);
});

test("does not treat a patient registry programme as a store directory", () => {
  const rows = Array.from({ length: 307 }, (_, index) => row(`X${String(index).padStart(3, "0")}`, "RED"));
  rows[0] = sourceRow("US-HI", "GREEN", {
    title: "Medical Cannabis Registry Program",
    url: "https://regulator.example.gov/US-HI/patient-registry",
    sourceOwnerGeo: "US-HI",
    appliesToGeos: ["US-HI"],
    officialPublisher: "State cannabis regulator",
    sourceKind: "CURRENT_PATIENT_REGISTRY_AND_DISPENSARY_PROGRAM_GUIDANCE",
    sourceType: "CURRENT_OPERATIONAL_PROGRAMME_STATUS_PAGE",
    primaryOrContext: "OPERATIONAL_PROGRAMME",
    cannabisSpecific: true,
  });
  assert.deepEqual(buildStoreSourceCandidates({ rows }), []);
});

test("does not treat a regulator home page as an extractable store directory", () => {
  const rows = Array.from({ length: 307 }, (_, index) => row(`X${String(index).padStart(3, "0")}`, "RED"));
  rows[0] = sourceRow("US-IL", "GREEN", {
    title: "Current medical and adult-use dispensary map and market",
    url: "https://regulator.example.gov/",
    sourceOwnerGeo: "US-IL",
    appliesToGeos: ["US-IL"],
    officialPublisher: "State cannabis regulator",
    sourceKind: "STATE_CANNABIS_REGULATOR_CURRENT_OPERATIONAL_ADULT_USE_MARKET",
    cannabisSpecific: true,
  });
  assert.deepEqual(buildStoreSourceCandidates({ rows }), []);
});

test("does not label a bare dispensary listing as medical without a medical signal", () => {
  const rows = Array.from({ length: 307 }, (_, index) => row(`X${String(index).padStart(3, "0")}`, "RED"));
  rows[0] = sourceRow("US-DE", "GREEN", {
    title: "Office of the Marijuana Commissioner - Dispensaries",
    url: "https://regulator.example.gov/US-DE/dispensaries",
    sourceOwnerGeo: "US-DE",
    appliesToGeos: ["US-DE"],
    officialPublisher: "State cannabis regulator",
    sourceKind: "CURRENT_OFFICIAL_OPERATIONAL_DISPENSARY_DIRECTORY",
    sourceType: "CURRENT_OFFICIAL_OPERATIONAL_DISPENSARY_DIRECTORY",
    primaryOrContext: "OPERATIONAL",
    cannabisSpecific: true,
  });
  const [candidate] = buildStoreSourceCandidates({ rows });
  assert.deepEqual(candidate.store_type_candidates, ["OTHER_REGULATED_POINT"]);
});

test("queues a multilingual licensed pharmaceutical-establishment list as a review-only regulated-point candidate", () => {
  const rows = Array.from({ length: 307 }, (_, index) => row(`X${String(index).padStart(3, "0")}`, "RED"));
  rows[0] = sourceRow("PE", "GREEN", {
    title: "Listado de establecimientos farmacéuticos con licencia para comercialización de cannabis",
    url: "https://regulator.example.gov/PE/listado-establecimientos.pdf",
    sourceOwnerGeo: "PE",
    appliesToGeos: ["PE"],
    officialPublisher: "Ministry of Health regulator",
    sourceKind: "CURRENT_OFFICIAL_LIST_OF_LICENSED_CANNABIS_PHARMACEUTICAL_ESTABLISHMENTS",
    primaryOrContext: "OPERATIONAL_CONTEXT",
    cannabisSpecific: true,
  });
  const [candidate] = buildStoreSourceCandidates({ rows });
  assert.equal(candidate.geo_id, "PE");
  assert.equal(candidate.inventory_shape, "REGISTRY_DIRECTORY_CANDIDATE");
  assert.deepEqual(candidate.store_type_candidates, ["OTHER_REGULATED_POINT"]);
  assert.equal(candidate.status, "NEEDS_REVIEW");
});

test("collapses a landing page and its direct document from one official source family", () => {
  const rows = Array.from({ length: 307 }, (_, index) => row(`X${String(index).padStart(3, "0")}`, "RED"));
  rows[0] = {
    geo: "PE",
    truthColor: "GREEN",
    primaryLaw: {
      officialSources: [
        {
          title: "Official list of licensed cannabis pharmaceutical establishments",
          url: "https://regulator.example.gov/list",
          sourceOwnerGeo: "PE",
          appliesToGeos: ["PE"],
          officialPublisher: "Ministry of Health regulator",
          sourceKind: "CURRENT_OFFICIAL_LIST_OF_LICENSED_CANNABIS_PHARMACEUTICAL_ESTABLISHMENTS",
          primaryOrContext: "OPERATIONAL_CONTEXT",
          cannabisSpecific: true,
        },
        {
          title: "Official PDF list of licensed cannabis pharmaceutical establishments",
          url: "https://regulator.example.gov/list.pdf",
          sourceOwnerGeo: "PE",
          appliesToGeos: ["PE"],
          officialPublisher: "Ministry of Health regulator",
          sourceKind: "OFFICIAL_PDF_LIST_OF_LICENSED_CANNABIS_PHARMACEUTICAL_ESTABLISHMENTS",
          primaryOrContext: "OPERATIONAL_CONTEXT",
          cannabisSpecific: true,
        },
      ],
    },
  };
  const candidates = buildStoreSourceCandidates({ rows });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].source_url, "https://regulator.example.gov/list.pdf");
});

test("keeps an explicitly active official licence record as a narrower candidate", () => {
  const rows = Array.from({ length: 307 }, (_, index) => row(`X${String(index).padStart(3, "0")}`, "RED"));
  rows[0] = sourceRow("US-AK", "GREEN", {
    title: "Active operating retail marijuana licence 30838",
    url: "https://regulator.example.gov/US-AK/licence/30838",
    sourceOwnerGeo: "US-AK",
    appliesToGeos: ["US-AK"],
    officialPublisher: "State cannabis regulator",
    sourceKind: "CURRENT_ACTIVE_OPERATING_RETAIL_MARIJUANA_LICENSE",
    sourceType: "CURRENT_OFFICIAL_LICENSE_REGISTRY",
    primaryOrContext: "OPERATIONAL_RETAIL_EVIDENCE",
    cannabisSpecific: true,
  });
  const [candidate] = buildStoreSourceCandidates({ rows });
  assert.equal(candidate.inventory_shape, "SINGLE_LICENSE_RECORD_CANDIDATE");
  assert.equal(candidate.evidence.location_inventory_match, "CANDIDATE_SINGLE_LICENSE_RECORD");
});

test("requires a source-owned licensed-location signal and assigns a store type", () => {
  const rows = Array.from({ length: 307 }, (_, index) => row(`X${String(index).padStart(3, "0")}`, "RED"));
  rows[0] = sourceRow("US-CO", "GREEN", {
    title: "State cannabis regulator licensed adult-use retailer directory",
    url: "https://regulator.example.gov/US-CO/retailers.json",
    sourceOwnerGeo: "US-CO",
    appliesToGeos: ["US-CO"],
    officialPublisher: "State cannabis regulator",
    cannabisSpecific: true,
  });
  const [candidate] = buildStoreSourceCandidates({ rows });
  assert.equal(candidate.geo_id, "US-CO");
  assert.deepEqual(candidate.store_type_candidates, ["ADULT_USE_RETAIL"]);
  assert.equal(candidate.evidence.location_inventory_match, "CANDIDATE_DIRECTORY_OR_LIST");
});

test("retains an external C1/C2 official registry lead as NEEDS_REVIEW without promoting it", () => {
  const rows = Array.from({ length: 307 }, (_, index) => row(`X${String(index).padStart(3, "0")}`, "RED"));
  rows[0] = row("US-CO", "GREEN");
  const [candidate] = buildStoreSourceCandidates({ rows }, {
    leads: [{
      geo_id: "US-CO",
      authority: "State cannabis regulator",
      source_url: "https://regulator.example.gov/stores.csv",
      registry_parent_url: "https://regulator.example.gov/licensed-facilities",
      source_type_candidate: "CSV",
      inventory_shape: "REGISTRY_DIRECTORY_CANDIDATE",
      store_type_candidates: ["MEDICAL_DISPENSARY"],
      data_extractability: "MACHINE_READABLE_CANDIDATE",
      exact_fragment: "The official list contains license number, facility, address and expiry.",
      independent_review: {
        c1_status: "PROVEN",
        c2_status: "PROVEN",
        c3_status: "NOT_ACCEPTED",
        reviewed_at: "2026-08-13T17:18:23.000Z",
        review_protocol: "C1_CURRENT_OFFICIAL_EXPORT_AND_C2_SEMANTIC_C3_RENDER_UNAVAILABLE",
      },
    }],
  });
  assert.equal(candidate.geo_id, "US-CO");
  assert.equal(candidate.status, "NEEDS_REVIEW");
  assert.equal(candidate.source_classification, "NEEDS_REVIEW");
  assert.equal(candidate.evidence.c3_visual_review, "NOT_ACCEPTED");
  assert.equal(candidate.provenance.origin, "INDEPENDENT_EXTERNAL_OFFICIAL_C1_C2_REVIEW");
});

test("omits a lead already covered by an active independently validated official source", () => {
  const rows = Array.from({ length: 307 }, (_, index) => row(`X${String(index).padStart(3, "0")}`, "RED"));
  rows[0] = sourceRow("US-DE", "GREEN", {
    title: "Official cannabis dispensary licence directory",
    url: "https://regulator.example.gov/dispensaries/",
    sourceOwnerGeo: "US-DE",
    appliesToGeos: ["US-DE"],
    officialPublisher: "State cannabis regulator",
    cannabisSpecific: true,
  });
  const candidates = buildStoreSourceCandidates({ rows }, {
    leads: [{
      geo_id: "US-DE",
      authority: "State cannabis regulator",
      source_url: "https://regulator.example.gov/dispensaries/",
      source_type_candidate: "HTML_OR_INTERACTIVE",
      inventory_shape: "REGISTRY_DIRECTORY_CANDIDATE",
      store_type_candidates: ["ADULT_USE_RETAIL"],
      data_extractability: "NEEDS_ENDPOINT_INSPECTION",
      exact_fragment: "The official page lists licensed dispensary locations.",
      independent_review: {
        c1_status: "PROVEN",
        c2_status: "PROVEN",
        c3_status: "PROVEN",
        reviewed_at: "2026-08-20T15:00:00.000Z",
        review_protocol: "C1_C2_C3",
      },
    }],
  }, {
    sources: [{
      geo_id: "US-DE",
      source_url: "https://regulator.example.gov/dispensaries",
      status: "ACTIVE",
      independent_validation: "PROVEN",
    }],
  });
  assert.deepEqual(candidates, []);
});

test("omits a candidate already covered by an active source's official directory page", () => {
  const rows = Array.from({ length: 307 }, (_, index) => row(`X${String(index).padStart(3, "0")}`, "RED"));
  rows[0] = sourceRow("US-NY", "GREEN", {
    title: "Official cannabis dispensary licence directory",
    url: "https://regulator.example.gov/dispensaries",
    sourceOwnerGeo: "US-NY",
    appliesToGeos: ["US-NY"],
    officialPublisher: "State cannabis regulator",
    cannabisSpecific: true,
  });
  const candidates = buildStoreSourceCandidates({ rows }, { leads: [] }, {
    sources: [{
      geo_id: "US-NY",
      source_url: "https://api.example.gov/retailers",
      source_page_url: "https://regulator.example.gov/dispensaries/",
      status: "ACTIVE",
      independent_validation: "PROVEN",
    }],
  });
  assert.deepEqual(candidates, []);
});

test("omits a candidate retained as an explicit official source alias", () => {
  const rows = Array.from({ length: 307 }, (_, index) => row(`X${String(index).padStart(3, "0")}`, "RED"));
  rows[0] = sourceRow("US-MT", "GREEN", {
    title: "Official cannabis dispensary licence directory",
    url: "https://legacy-regulator.example.gov/dispensaries",
    sourceOwnerGeo: "US-MT",
    appliesToGeos: ["US-MT"],
    officialPublisher: "State cannabis regulator",
    cannabisSpecific: true,
  });
  const candidates = buildStoreSourceCandidates({ rows }, { leads: [] }, {
    sources: [{
      geo_id: "US-MT",
      source_url: "https://regulator.example.gov/dispensaries",
      source_alias_urls: ["https://legacy-regulator.example.gov/dispensaries"],
      status: "ACTIVE",
      independent_validation: "PROVEN",
    }],
  });
  assert.deepEqual(candidates, []);
});

test("carries a bounded C1 revalidation without upgrading a mixed registry lead", () => {
  const rows = Array.from({ length: 307 }, (_, index) => row(`X${String(index).padStart(3, "0")}`, "RED"));
  rows[0] = row("US-AZ", "GREEN");
  const [candidate] = buildStoreSourceCandidates({ rows }, {
    leads: [{
      geo_id: "US-AZ",
      authority: "State health regulator",
      source_url: "https://regulator.example.gov/provider?name=203",
      source_type_candidate: "HTML_OR_INTERACTIVE",
      inventory_shape: "REGISTRY_DIRECTORY_CANDIDATE",
      store_type_candidates: ["OTHER_REGULATED_POINT"],
      data_extractability: "PAGINATED_PUBLIC_SEARCH_FORM_REQUIRES_TYPE_FILTER_AND_STATUS_REVIEW",
      exact_fragment: "A mixed public directory contains one marijuana-facility row.",
      independent_review: {
        c1_status: "PROVEN",
        c2_status: "PROVEN",
        c3_status: "NOT_ACCEPTED",
        reviewed_at: "2026-08-15T02:41:23.000Z",
        review_protocol: "C1_C2_BOUNDARY",
      },
      revalidation: {
        checked_at: "2026-08-20T12:00:00.000Z",
        http_status: 200,
        response_sha256: "a".repeat(64),
        structured_sha256: "b".repeat(64),
        structured_fingerprint_scope: "FIRST_PAGE_VISIBLE_ROWS_AND_COUNTS",
        observed_records: 263,
        observed_pages: 18,
        query_scope: "NAME_QUERY_ONLY_MIXED_FACILITIES",
      },
    }],
  });
  assert.equal(candidate.status, "NEEDS_REVIEW");
  assert.equal(candidate.source_confidence, "PARTIAL");
  assert.equal(candidate.checked_at, "2026-08-20T12:00:00.000Z");
  assert.equal(candidate.evidence.freshness, "CURRENT_C1_REVALIDATED_NOT_FULL_REGISTRY");
  assert.deepEqual(candidate.provenance.revalidation, {
    checked_at: "2026-08-20T12:00:00.000Z",
    http_status: 200,
    response_sha256: "a".repeat(64),
    structured_sha256: "b".repeat(64),
    structured_fingerprint_scope: "FIRST_PAGE_VISIBLE_ROWS_AND_COUNTS",
    observed_records: 263,
    observed_pages: 18,
    query_scope: "NAME_QUERY_ONLY_MIXED_FACILITIES",
  });
});
