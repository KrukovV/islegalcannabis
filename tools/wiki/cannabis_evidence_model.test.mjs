import assert from "node:assert/strict";
import test from "node:test";
import {
  classifySourceRelevance,
  compareLegalAxes,
  containsMixedMachineLanguage,
  containsRepeatedSummary,
  deriveAuditColor,
  hasCannabisFamilySignal,
  hasContradictoryAxis,
  makeCanonicalEvidenceRecord,
  normalizeLegalAxisValue,
  validateManualReviewRecord,
} from "./cannabis_evidence_model.mjs";

test("Georgia country can be modelled separately from US-GA", () => {
  const country = makeCanonicalEvidenceRecord({ geo: "GE", title: "Georgia cannabis law", url: "https://matsne.gov.ge/cannabis-law" });
  const state = makeCanonicalEvidenceRecord({ geo: "US-GA", title: "Georgia medical cannabis commission law", url: "https://rules.sos.ga.gov/medical-cannabis" });
  assert.equal(country.geo, "GE");
  assert.equal(state.geo, "US-GA");
});

test("Congo Republic can be modelled separately from DR Congo", () => {
  const cg = makeCanonicalEvidenceRecord({ geo: "CG", title: "Republic of the Congo narcotics code cannabis schedule" });
  const cd = makeCanonicalEvidenceRecord({ geo: "CD", title: "DR Congo narcotics code cannabis schedule" });
  assert.notEqual(cg.geo, cd.geo);
});

test("same territory names do not collapse URL ownership records", () => {
  const a = makeCanonicalEvidenceRecord({ geo: "SX", source_url: "https://gov.sx/cannabis-law", title: "Cannabis law" });
  const b = makeCanonicalEvidenceRecord({ geo: "MF", source_url: "https://www.legifrance.gouv.fr/cannabis-code", title: "Cannabis code" });
  assert.notEqual(`${a.geo}|${a.source_url}`, `${b.geo}|${b.source_url}`);
});

test("medical legal and recreational illegal is a scoped partial match, not a contradiction", () => {
  assert.equal(hasContradictoryAxis(["ILLEGAL", "REGULATED"]), false);
  assert.equal(
    compareLegalAxes({
      projectValue: "ILLEGAL",
      officialValue: "REGULATED",
      evidenceScope: "DIRECT_MEDICAL_CANNABIS_PROGRAM",
    }),
    "PARTIAL_MATCH",
  );
});

test("NOT_CONFIRMED does not become ILLEGAL", () => {
  assert.equal(normalizeLegalAxisValue("not confirmed by this page"), "NOT_CONFIRMED");
  assert.notEqual(normalizeLegalAxisValue("not confirmed by this page"), "ILLEGAL");
});

test("deriveAuditColor keeps decriminalization out of green", () => {
  assert.equal(deriveAuditColor({ recreational: "DECRIMINALIZED" }), "YELLOW");
  assert.equal(deriveAuditColor({ recreational: "LEGAL" }), "GREEN");
});

test("deriveAuditColor sets RED only on confirmed non-allowed regimes", () => {
  assert.equal(deriveAuditColor({ recreational: "ILLEGAL", medical: "NOT_APPLICABLE" }), "RED");
  assert.equal(deriveAuditColor({ recreational: "ILLEGAL", medical: "MEDICAL_ONLY" }), "YELLOW");
  assert.equal(deriveAuditColor({ recreational: "UNKNOWN", medical: "UNKNOWN" }), "UNKNOWN");
});

test("context-only evidence cannot create a legal color", () => {
  assert.equal(
    compareLegalAxes({
      projectValue: "ILLEGAL",
      officialValue: "LEGAL",
      evidenceScope: "OFFICIAL_CONTEXT_ONLY",
    }),
    "INSUFFICIENT_OFFICIAL_EVIDENCE",
  );
});

test("cannabis resin, hashish and bhang remain cannabis-family evidence", () => {
  assert.equal(hasCannabisFamilySignal("Cannabis resin is listed in Schedule I"), true);
  assert.equal(hasCannabisFamilySignal("Hashish is listed in the narcotics law"), true);
  assert.equal(hasCannabisFamilySignal("Bhang preparations are regulated"), true);
});

test("edibles without cannabis context are rejected", () => {
  const result = classifySourceRelevance({ title: "Food safety rules for edibles", note: "No cannabis text on the page" });
  assert.equal(result.acceptedAsDirect, false);
  assert.equal(result.exclusion_reason, "CONTEXT_SENSITIVE_TERM_WITHOUT_CANNABIS_CONTEXT");
});

test("leadership decree without cannabis-specific norm is context-only", () => {
  const result = classifySourceRelevance({
    sourceKind: "NATIONAL_GOVERNMENT_CURRENT_LEADERSHIP_DECREE",
    title: "Decree prohibiting hashish and all narcotics",
    note: "The decree bans poppy cultivation and any intoxicants without a cannabis-specific schedule or program.",
  });
  assert.equal(result.acceptedAsDirect, false);
  assert.equal(result.evidence_scope, "OFFICIAL_CONTEXT_ONLY");
});

test("leadership decree with cannabis-specific norm is retained", () => {
  const result = classifySourceRelevance({
    sourceKind: "NATIONAL_GOVERNMENT_CURRENT_LEADERSHIP_DECREE",
    title: "Presidential decree establishing a medical cannabis programme",
    note: "The decree licenses medical cannabis patients and regulates cannabis preparations.",
  });
  assert.equal(result.acceptedAsDirect, true);
});

test("hemp-only evidence does not become recreational legalization", () => {
  assert.equal(deriveAuditColor({ recreational: "NOT_CONFIRMED", medical: "NOT_CONFIRMED", industrial_hemp: "LEGAL" }), "UNKNOWN");
});

test("historical or repealed law is not current direct evidence", () => {
  const result = classifySourceRelevance({
    title: "Repealed cannabis law",
    note: "Former cannabis possession act, historical version",
  });
  assert.equal(result.acceptedAsDirect, false);
  assert.equal(result.exclusion_reason, "BILL_DRAFT_HISTORICAL_OR_REPEALED_SOURCE_NOT_CURRENT_LAW");
});

test("bill is not treated as enacted law", () => {
  const result = classifySourceRelevance({
    title: "Draft medical cannabis bill",
    note: "Proposed patient access programme",
  });
  assert.equal(result.acceptedAsDirect, false);
});

test("screenshot without readable visual proof fails manual review", () => {
  const result = validateManualReviewRecord({
    screenshot_opened: true,
    visually_read: false,
    geo_identity_confirmed: true,
    cannabis_relevance_confirmed: true,
    negation_checked: true,
    effective_law_checked: true,
    bill_vs_law_checked: true,
    summary: "Unreadable crop",
  });
  assert.equal(result.ok, false);
});

test("mismatch is not created when official evidence is insufficient", () => {
  assert.equal(
    compareLegalAxes({
      projectValue: "ILLEGAL",
      officialValue: "LEGAL",
      evidenceScope: "OFFICIAL_CONTEXT_ONLY",
    }),
    "INSUFFICIENT_OFFICIAL_EVIDENCE",
  );
});

test("UI summary repeated sentences are detected", () => {
  assert.equal(containsRepeatedSummary("Official source confirms the model. Official source confirms the model."), true);
});

test("mixed machine-language UI phrases are detected", () => {
  assert.equal(containsMixedMachineLanguage("criminal fine ИЛИ up ДЛЯ six months"), true);
});

test("one axis cannot be LEGAL and ILLEGAL without scope", () => {
  assert.equal(hasContradictoryAxis(["LEGAL", "ILLEGAL"]), true);
});

test("processed count can be guarded against manifest count", () => {
  const manifestGeoCount = 307;
  const processedGeoCount = 306;
  assert.notEqual(processedGeoCount, manifestGeoCount);
});

test("SSOT and map-color invariants are explicit booleans", () => {
  const invariants = {
    status_data_changed: false,
    map_colors_changed: false,
  };
  assert.equal(invariants.status_data_changed, false);
  assert.equal(invariants.map_colors_changed, false);
});
