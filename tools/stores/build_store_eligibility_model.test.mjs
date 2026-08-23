import assert from "node:assert/strict";
import test from "node:test";
import { buildStoreEligibilityModel } from "./build_store_eligibility_model.mjs";

function row(geo, truthColor) {
  return { geo, truthColor, truthRuleId: `RULE_${truthColor}` };
}

function evidence(overrides = {}) {
  return {
    evidence_id: "US-GA:medical-dispensary-law",
    geo_id: "US-GA",
    store_type: "MEDICAL_DISPENSARY",
    legal_state: "LEGAL",
    status: "VALIDATED",
    independent_of_store_registry: true,
    official: true,
    source_classification: "OFFICIAL_REGULATOR",
    jurisdiction_validation: "VALID",
    confidence: "PROVEN",
    source_url: "https://regulator.example.gov/law",
    authority: "Example regulator",
    exact_fragment: "Licensed medical dispensaries may operate.",
    reviewed_at: "2026-08-12T00:00:00.000Z",
    review_protocol: "C1_CURRENT_OFFICIAL_HTML_FETCH_AND_C2_SEMANTIC_C3_DIRECT_OFFICIAL_BROWSER_VISUAL_REVIEW",
    ...overrides,
  };
}

test("store type legality is never inferred from a canonical GREEN/YELLOW color", () => {
  const rows = Array.from({ length: 307 }, (_, index) => row(`X${String(index).padStart(3, "0")}`, "RED"));
  rows[0] = row("US-CO", "GREEN");
  rows[1] = row("US-GA", "YELLOW");
  rows[2] = row("GE", "GREEN");
  rows[3] = row("AF", "UNKNOWN");
  const model = buildStoreEligibilityModel({ rows }, { evidence: [evidence()] });
  const byGeo = new Map(model.rows.map((item) => [item.geo_id, item]));
  assert.equal(byGeo.get("US-CO").retail_legality.state, "UNPROVEN");
  assert.equal(byGeo.get("US-GA").medical_dispensary_legality.state, "PROVEN_LEGAL");
  assert.equal(byGeo.get("GE").medical_dispensary_legality.state, "UNPROVEN");
  assert.equal(byGeo.get("AF").retail_legality.state, "UNKNOWN");
  assert.equal(byGeo.get("X004").retail_legality.state, "NOT_LEGAL");
});

test("a registry-dependent, wrong-jurisdiction or conflicting claim cannot prove eligibility", () => {
  const rows = Array.from({ length: 307 }, (_, index) => row(`X${String(index).padStart(3, "0")}`, "RED"));
  rows[0] = row("US-GA", "GREEN");
  const model = buildStoreEligibilityModel({ rows }, {
    evidence: [
      evidence({ independent_of_store_registry: false }),
      evidence({ evidence_id: "US-GA:legal" }),
      evidence({ evidence_id: "US-GA:conflict", legal_state: "NOT_LEGAL" }),
      evidence({ evidence_id: "GE:wrong-jurisdiction", geo_id: "GE" }),
    ],
  });
  const usGa = model.rows.find((item) => item.geo_id === "US-GA");
  assert.equal(usGa.medical_dispensary_legality.state, "UNPROVEN");
});

test("unreviewed legal evidence remains non-promoting", () => {
  const rows = Array.from({ length: 307 }, (_, index) => row(`X${String(index).padStart(3, "0")}`, "RED"));
  rows[0] = row("US-CO", "GREEN");
  const model = buildStoreEligibilityModel({ rows }, { evidence: [evidence({ geo_id: "US-CO", status: "NEEDS_REVIEW" })] });
  assert.equal(model.rows.find((item) => item.geo_id === "US-CO").medical_dispensary_legality.state, "UNPROVEN");
});

test("C1 and C2 legal extraction without independent C3 visual review remains non-promoting", () => {
  const rows = Array.from({ length: 307 }, (_, index) => row(`X${String(index).padStart(3, "0")}`, "RED"));
  rows[0] = row("US-AZ", "GREEN");
  const model = buildStoreEligibilityModel({ rows }, {
    evidence: [evidence({
      evidence_id: "US-AZ:adult-use-retail-c1-c2-only",
      geo_id: "US-AZ",
      store_type: "ADULT_USE_RETAIL",
      review_protocol: "C1_CURRENT_OFFICIAL_HTML_FETCH_AND_C2_SEMANTIC_REVIEW_ONLY",
    })],
  });
  assert.equal(model.rows.find((item) => item.geo_id === "US-AZ").retail_legality.state, "UNPROVEN");
});
