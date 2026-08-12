import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildFreshAxisEvidenceByGeo,
  buildFreshAxisTruthOverride,
  normalizeVisualReviewLedgerPacket,
} from "./build_wiki_truth_307_truth_audit_report.mjs";
import {
  classifyColorVerdict,
  hasFreshIndependentVisualEvidence,
  hasLiveMapCapture,
  hasProvenAdultUse,
  normalizeLiveMapCapture,
} from "./build_wiki_truth_307_final_reconciliation.mjs";
import {
  assertCanonicalGeoUniverse,
  assertLedgerSourceApplicability,
  auditCanonicalGeoUniverse,
  selectNextCanonicalGeo,
} from "./canonical_geo_universe.mjs";
import { buildAxisCell } from "./build_wiki_truth_307_legal_knowledge_axis_matrix.mjs";
import { evaluateLegalInterpretation } from "./build_wiki_truth_307_acceptance_audit.mjs";
import { deriveOfficialTruthColor } from "../../apps/web/src/lib/wikiTruthColorEngine.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const normalizedUrlKey = (value) => {
  const parsed = new URL(value);
  parsed.hash = "";
  if (parsed.pathname !== "/") parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString();
};

test("canonical GEO validator accepts an exact one-to-one ledger", () => {
  const result = assertCanonicalGeoUniverse({
    canonicalGeos: ["AA", "BB"],
    ledgerRows: [{ geo: "AA" }, { geo: "BB" }],
    expectedCount: 2,
  });
  assert.equal(result.valid, true);
});

test("canonical GEO validator reports a noncanonical alias instead of silently dropping it", () => {
  const result = auditCanonicalGeoUniverse({
    canonicalGeos: ["AA", "BB"],
    ledgerRows: [{ geo: "AA" }, { geo: "BB" }, { geo: "US-BB" }],
    expectedCount: 2,
  });
  assert.equal(result.valid, false);
  assert.deepEqual(result.extras, ["US-BB"]);
  assert.throws(
    () => assertCanonicalGeoUniverse({
      canonicalGeos: ["AA", "BB"],
      ledgerRows: [{ geo: "AA" }, { geo: "BB" }, { geo: "US-BB" }],
      expectedCount: 2,
    }),
    /extras=US-BB/,
  );
});

test("canonical GEO validator reports duplicate and missing rows", () => {
  const result = auditCanonicalGeoUniverse({
    canonicalGeos: ["AA", "BB"],
    ledgerRows: [{ geo: "AA" }, { geo: "AA" }],
    expectedCount: 2,
  });
  assert.equal(result.valid, false);
  assert.deepEqual(result.ledgerDuplicates, [{ geo: "AA", count: 2 }]);
  assert.deepEqual(result.missing, ["BB"]);
});

test("canonical GEO selection keeps country and state IDs exact", () => {
  const canonicalGeos = ["AZ", "US-AZ", "US-AR"];
  assert.equal(
    selectNextCanonicalGeo({ canonicalGeos, completedGeos: ["US-AZ"] }),
    "AZ",
  );
  assert.throws(
    () => selectNextCanonicalGeo({ canonicalGeos, completedGeos: ["US_AZ"] }),
    /extras=US_AZ/,
  );
});

test("source applicability keeps overlapping country and state GEOs exact", () => {
  const canonicalGeos = ["AZ", "US-AZ"];
  assert.doesNotThrow(() => assertLedgerSourceApplicability({
    canonicalGeos,
    ledgerRows: [{
      geo: "AZ",
      verified_sources: [{ applies_to_geo: ["AZ"] }],
    }, {
      geo: "US-AZ",
      verified_sources: [{ applies_to_geo: ["US-AZ"] }],
    }],
  }));
  assert.throws(
    () => assertLedgerSourceApplicability({
      canonicalGeos,
      ledgerRows: [{
        geo: "AZ",
        verified_sources: [{ applies_to_geo: ["US-AZ"] }],
      }],
    }),
    /rowMismatches=AZ:verified_sources\[0\]/,
  );
  assert.throws(
    () => assertLedgerSourceApplicability({
      canonicalGeos,
      ledgerRows: [{
        geo: "AZ",
        verified_sources: [{ applies_to_geo: ["US_AZ"] }],
      }],
    }),
    /invalidTargets=AZ:verified_sources\[0\]:US_AZ/,
  );
  assert.throws(
    () => assertLedgerSourceApplicability({
      canonicalGeos,
      ledgerRows: [{
        geo: "AZ",
        verified_sources: [{
          applies_to_geo: ["AZ", "US-AZ"],
          legal_basis_for_extension: "Unscoped shared source.",
        }],
      }],
    }),
    /multiGeoMissingLegalBasis=AZ:verified_sources\[0\]:AZ,US-AZ/,
  );
  assert.doesNotThrow(() => assertLedgerSourceApplicability({
    canonicalGeos,
    ledgerRows: [{
      geo: "AZ",
      verified_sources: [{
        applies_to_geo: ["AZ", "US-AZ"],
        legal_basis_for_extension: {
          AZ: "Direct Azerbaijan law applies to Azerbaijan.",
          "US-AZ": "A separate Arizona law applies to Arizona.",
        },
      }],
    }],
  }));
  assert.doesNotThrow(() => assertLedgerSourceApplicability({
    canonicalGeos,
    ledgerRows: [{
      geo: "AZ",
      verified_sources: [{
        applies_to_geo: [],
        primary_or_context: "CONTEXT_ONLY_NO_TERRITORIAL_APPLICABILITY",
      }],
    }],
  }));
});

test("source ownership rejects country-state terminal-code collisions", () => {
  const canonicalGeos = ["AZ", "US-AZ"];
  assert.throws(
    () => assertLedgerSourceApplicability({
      canonicalGeos,
      ledgerRows: [{
        geo: "AZ",
        verified_sources: [{
          source_owner_geo: "US-AZ",
          applies_to_geo: ["AZ"],
          legal_basis_for_extension: "This must never be accepted as Azerbaijan evidence.",
        }],
      }],
    }),
    /ownerSuffixCollisions=AZ:verified_sources\[0\]:US-AZ->AZ/,
  );
  assert.throws(
    () => assertLedgerSourceApplicability({
      canonicalGeos,
      ledgerRows: [{
        geo: "US-AZ",
        verified_sources: [{
          source_owner_geo: "AZ",
          applies_to_geo: ["US-AZ"],
          legal_basis_for_extension: "This must never be accepted as Arizona evidence.",
        }],
      }],
    }),
    /ownerSuffixCollisions=US-AZ:verified_sources\[0\]:AZ->US-AZ/,
  );
});

test("matrix publishes every annotated current-ledger source with revalidation audit metadata", () => {
  const ledger = JSON.parse(fs.readFileSync(
    path.join(ROOT, "data", "official", "cannabis_law_visual_reviews.audit.json"),
    "utf8",
  ));
  const matrix = JSON.parse(fs.readFileSync(
    path.join(ROOT, "data", "reviews", "wiki-truth-cannabis-law-matrix-307.json"),
    "utf8",
  ));
  const matrixByGeo = new Map(matrix.rows.map((entry) => [entry.geo, entry]));
  const currentSources = ledger.rows.flatMap((ledgerRow) =>
    (ledgerRow.current_official_sources || []).map((source) => ({ ledgerRow, source })),
  );

  assert(currentSources.length > 0);
  for (const { ledgerRow, source } of currentSources) {
    const annotation = source.source_annotation || source.annotation || source.note;
    assert(source.url, `${ledgerRow.geo}: current source URL`);
    assert(annotation, `${ledgerRow.geo}:${source.url}: current source annotation`);
    const matrixRow = matrixByGeo.get(ledgerRow.geo);
    assert(matrixRow, `${ledgerRow.geo}: matrix row`);
    const published = [
      ...(matrixRow.directOfficialCannabisLawLinks || []),
      ...(matrixRow.officialContextLinks || []),
      ...(matrixRow.supplementalOfficialLinks || []),
    ].find((link) => normalizedUrlKey(link.url) === normalizedUrlKey(source.url));
    assert(published, `${ledgerRow.geo}:${source.url}: published from current ledger`);
    assert.equal(published.sourceAnnotation, annotation, `${ledgerRow.geo}:${source.url}: annotation projection`);
    assert.equal(
      published.revalidation?.revalidation_state,
      source.revalidation?.revalidation_state,
      `${ledgerRow.geo}:${source.url}: revalidation-state projection`,
    );
    assert.equal(
      published.revalidation?.access_state,
      source.revalidation?.access_state,
      `${ledgerRow.geo}:${source.url}: access-state projection`,
    );
  }
});

test("validated fresh primary-law axis findings remain direct matrix evidence", () => {
  const row = {
    truth: {
      source: "FRESH_PRIMARY_LAW_AXIS_RECONCILIATION",
      axisFindings: {
        adult_use: { status: "PROVEN_ADULT_USE_LEGAL" },
        recreational_cultivation: {
          status: "PROVEN_LAWFUL_ADULT_PRIVATE_CULTIVATION_UP_TO_THREE_PLANTS",
        },
        programme_commenced: { status: "PROVEN_CURRENT_ACT_IN_FORCE" },
      },
      validation: {
        visualEvidenceComplete: true,
        cannabisSpecificFragmentVisible: true,
        effectiveRuleVisible: true,
        applicabilityResolved: true,
      },
    },
    truthLayers: {},
  };

  for (const [group, axis, value] of [
    ["recreational", "possession", "PROVEN_ADULT_USE_LEGAL"],
    ["recreational", "use", "PROVEN_ADULT_USE_LEGAL"],
    [
      "recreational",
      "cultivation_personal",
      "PROVEN_LAWFUL_ADULT_PRIVATE_CULTIVATION_UP_TO_THREE_PLANTS",
    ],
    ["legal_state", "commenced", "PROVEN_CURRENT_ACT_IN_FORCE"],
  ]) {
    const cell = buildAxisCell(group, axis, row);
    assert.equal(cell.status, "KNOWN");
    assert.equal(cell.value, value);
    assert.equal(cell.evidenceClass, "FRESH_PRIMARY_LAW_AXIS_FINDING");
  }
  assert.equal(buildAxisCell("recreational", "sale", row).status, "UNKNOWN");
});

test("unvalidated fresh findings cannot promote a matrix axis", () => {
  const row = {
    truth: {
      source: "FRESH_PRIMARY_LAW_AXIS_RECONCILIATION",
      axisFindings: {
        adult_use: { status: "PROVEN_ADULT_USE_LEGAL" },
      },
      validation: {
        visualEvidenceComplete: true,
        cannabisSpecificFragmentVisible: true,
        effectiveRuleVisible: false,
        applicabilityResolved: true,
      },
    },
    truthLayers: {},
  };
  assert.equal(buildAxisCell("recreational", "possession", row).status, "UNKNOWN");
});

test("narrow CBD medicine exception remains limited and cannot prove a full patient programme", () => {
  const result = deriveOfficialTruthColor({
    officialStatus: {
      recreational: "RECREATIONAL_PROHIBITION_PROVEN",
      medical: "CBD_MEDICINE_LIMITED_EXCEPTION",
      enforcement: "UNASSESSED",
    },
  });
  assert.equal(result.color, "YELLOW");
  assert.equal(result.ruleId, "OFFICIAL_STATUS_LIMITED_LAWFUL_MODE");
});

test("research-only cannabis authorization cannot create a Yellow color", () => {
  const result = deriveOfficialTruthColor({
    officialStatus: {
      recreational: "UNASSESSED",
      medical: "RESEARCH_USE_ONLY_AUTHORIZED",
      enforcement: "UNASSESSED",
    },
  });
  assert.equal(result.color, "UNKNOWN");
});

test("industrial cannabis authorization cannot create a Yellow color", () => {
  const result = deriveOfficialTruthColor({
    officialStatus: {
      recreational: "UNASSESSED",
      medical: "INDUSTRIAL_CULTIVATION_LICENSED",
      enforcement: "UNASSESSED",
    },
  });
  assert.equal(result.color, "UNKNOWN");
});

test("operational industry authority and pilot cultivation cannot create a Yellow color", () => {
  const result = deriveOfficialTruthColor({
    officialStatus: {
      recreational: "CURRENT_RECREATIONAL_STATUS_UNRESOLVED; OPERATIONAL_CANNABIS_INDUSTRY_LICENSING_PROVEN",
      medical: "NO_OPERATIONAL_PATIENT_ACCESS_PROOF; INDUSTRIAL_CULTIVATION_LICENSED",
      enforcement: "NO_CURRENT_TRACEABLE_FULL_NEGATIVE_AXIS_DERIVED",
    },
  });
  assert.equal(result.color, "UNKNOWN");
  assert.equal(result.ruleId, "OFFICIAL_STATUS_INDETERMINATE");
});

test("unassessed generic licensing exception remains Unknown instead of Yellow or Red", () => {
  const result = deriveOfficialTruthColor({
    officialStatus: {
      recreational: "RECREATIONAL_PROHIBITION_PROVEN",
      medical: "NONE_CONFIRMED_CANNABIS_PROGRAM_GENERAL_LICENSE_EXCEPTION_NOT_EXHAUSTIVELY_ASSESSED",
      enforcement: "UNASSESSED",
    },
  });
  assert.equal(result.color, "UNKNOWN");
});

test("missing patient-access evidence cannot create a Red color from recreational prohibition alone", () => {
  const result = deriveOfficialTruthColor({
    officialStatus: {
      recreational: "RECREATIONAL_PROHIBITION_PROVEN",
      medical: "UNCONFIRMED",
      enforcement: "UNASSESSED",
    },
  });
  assert.equal(result.color, "UNKNOWN");
});

test("documented competing claimant regimes prove the uncolored scope interpretation without selecting a claimant", () => {
  const result = evaluateLegalInterpretation({}, {
    visualReviewStatus: "VISUALLY_REVIEWED_OFFICIAL_CONTEXT_ONLY",
    screenshotPaths: [new URL("./truth_first_reconciliation.test.mjs", import.meta.url).pathname],
    truthLayers: {
      legalInterpretation: {
        source: "UNAVAILABLE",
        axis: {
          recreational: "UNKNOWN",
          medical: "UNKNOWN",
          enforcement: "UNKNOWN",
        },
        notes: "Claimant jurisdiction context; no single territorial cannabis law applies.",
      },
    },
    differenceDescription: "Competing claimant jurisdiction scope is unresolved; no territorial cannabis-law regime can be selected.",
    reviewNotes: "Official cannabis code and dispute material were visually reviewed without choosing a sovereign.",
  });
  assert.equal(result.status, "PROVEN");
  assert.equal(result.evidence.scopeException, true);
});

function operationalPatientEvidence(overrides = {}) {
  return {
    rowStatus: "FRESH_AXIS_RECONCILED",
    truthFirstColorConclusion: {
      color: "GREEN",
      rule: "OPERATIONAL_PATIENT_ACCESS_FROM_INDEPENDENT_AXES",
      rationale: "Patient, prescriber, lawful supply and operational axes are proved.",
      adultUseInference: false,
    },
    validation: {
      officialOwnerVisible: true,
      visualReviewComplete: true,
      proposalOnly: true,
    },
    evidenceAxes: {
      patient_access: { status: "PROVEN" },
      physician_certification: { status: "PROVEN" },
      lawful_supply: { status: "PROVEN" },
      programme_operational: { status: "PROVEN" },
      adult_use: { status: "NOT_USED_FOR_CONCLUSION" },
    },
    officialSources: [
      {
        url: "https://health.example.gov/patient-access",
        sourceType: "OPERATIONAL_PROGRAMME",
        sourceOwner: "Health Ministry",
        checkedVisually: true,
        screenshot: "evidence/patient-access.png",
        facts: ["patient", "prescriber", "supply"],
      },
      {
        url: "https://laws.example.gov/medical-cannabis-regulation",
        sourceType: "PRIMARY_LAW",
        sourceOwner: "Official legislation portal",
        checkedVisually: true,
        screenshots: ["evidence/medical-regulation.png"],
        facts: ["lawful route", "dispensing", "operational"],
      },
    ],
    ...overrides,
  };
}

test("operational patient access aggregates legacy source fields and generic proven axes", () => {
  const result = buildFreshAxisTruthOverride(operationalPatientEvidence());
  assert.equal(result?.color, "GREEN");
  assert.equal(result?.source, "FRESH_PRIMARY_LAW_AXIS_RECONCILIATION");
  assert.equal(result?.facts.patient, true);
  assert.equal(result?.facts.lawfulRoute, true);
  assert.equal(result?.facts.supply, true);
  assert.equal(result?.facts.operational, true);
});

test("incomplete patient evidence cannot create a fresh GREEN", () => {
  const evidence = operationalPatientEvidence({
    evidenceAxes: {
      patient_access: { status: "PROVEN" },
      physician_certification: { status: "PROVEN" },
      lawful_supply: { status: "PROVEN" },
      programme_operational: { status: "NOT_PROVEN" },
    },
  });
  assert.equal(buildFreshAxisTruthOverride(evidence), null);
});

test("independent review packets normalize YES axes and merge official sources without a GEO-specific override", () => {
  const result = buildFreshAxisTruthOverride({
    independentCurrentLawReview: {
      independentTruthColor: "GREEN",
      independentTruthRule: "GENERAL_MULTI_SOURCE_OPERATIONAL_PATIENT_ACCESS",
      legalInterpretation: "Independent current official sources establish the connected patient route.",
      visualReview: {
        officialOwnerVisible: true,
        officialDomainVisible: true,
        screenshotValid: true,
        reviewedByHumanVisual: true,
      },
      evidenceAxes: {
        patient_eligible: { value: "YES" },
        prescriber_route: { value: "YES" },
        lawful_supply: { value: "YES" },
        programme_operational: { value: "YES" },
      },
      currentOfficialSources: [
        {
          url: "https://health.example.gov/patient-route",
          sourceType: "CURRENT_REGULATOR_PATIENT_ROUTE",
          officialOwner: "Health Department",
          visualEvidence: "evidence/patient-route.png",
          visualReviewed: true,
        },
        {
          url: "https://laws.example.gov/dispensing",
          sourceType: "CURRENT_PRIMARY_STATUTE",
          officialOwner: "Legislature",
          visualEvidence: "evidence/dispensing.png",
          visualReviewed: true,
        },
      ],
    },
  });
  assert.equal(result?.color, "GREEN");
  assert.equal(result?.facts.patient, true);
  assert.equal(result?.facts.lawfulRoute, true);
  assert.equal(result?.facts.supply, true);
  assert.equal(result?.facts.operational, true);
});

test("snake-case structured review packets contribute official multi-source axes generically", () => {
  const result = buildFreshAxisTruthOverride({
    reconciliationStatus: "FRESH_AXIS_RECONCILED",
    currentLawReopen: {
      independent_truth_color: "GREEN",
      independent_truth_rule: "GENERAL_OPERATIONAL_PATIENT_ACCESS_MULTI_AXIS",
      legal_interpretation: "Separate current official sources establish the connected patient route.",
      visual_review: {
        officialOwnerVisible: true,
        screenshotValid: true,
        reviewedByHumanVisual: true,
      },
      evidence_axes: {
        patient_eligible: "YES",
        prescriber_route: "YES",
        lawful_supply: "YES",
        programme_operational: "YES",
      },
      sources: [
        {
          title: "Department patient route",
          url: "https://health.example.gov/patient-route",
          source_type: "OFFICIAL_PROGRAMME_PATIENT_ROUTE",
          official_owner: "Health Department",
          visual_evidence: "evidence/patient-route.png",
          visual_reviewed: true,
        },
        {
          title: "Official dispensing rule",
          url: "https://laws.example.gov/dispensing",
          source_type: "OFFICIAL_PRIMARY_DISPENSING_RULE",
          official_owner: "Official legislature",
          visual_evidence: "evidence/dispensing.png",
          visual_reviewed: true,
        },
      ],
    },
  });
  assert.equal(result?.color, "GREEN");
  assert.equal(result?.facts.patient, true);
  assert.equal(result?.facts.lawfulRoute, true);
  assert.equal(result?.facts.supply, true);
  assert.equal(result?.facts.operational, true);
});

test("visual-review ledger packets feed legal truth without depending on final screenshot acceptance", () => {
  const packet = normalizeVisualReviewLedgerPacket({
    geo: "TEST-OPERATIONAL-PATIENT-ACCESS",
    status: "VISUALLY_VERIFIED",
    independent_truth_color: "GREEN",
    independent_truth_rule: "GENERAL_OPERATIONAL_PATIENT_ACCESS_MULTI_AXIS",
    independent_conclusion: "Official sources prove the connected patient route.",
    evidence_axes: {
      patient_eligible: "YES",
      prescriber_route: "YES",
      lawful_supply: "YES",
      programme_operational: "YES",
    },
    verified_sources: [
      {
        title: "National legal information system patient route",
        url: "https://lex.example/patient-route",
        source_kind: "NATIONAL_CURRENT_OFFICIAL_CONTROLLED_SUBSTANCE_ORDER",
        source_type: "CURRENT_PRIMARY_NATIONAL_REGULATION",
        screenshot_path: "evidence/patient-registry.png",
      },
      {
        title: "Legislature dispensing statute",
        url: "https://laws.example.gov/dispensing-statute",
        source_kind: "OFFICIAL_PRIMARY_LAW_DISPENSING",
        screenshot_path: "evidence/dispensing-statute.png",
      },
    ],
    final_visual_acceptance: {
      status: "PARTIAL_CURRENT_SOURCE_SCREENSHOT_PENDING",
    },
  });
  const evidenceByGeo = buildFreshAxisEvidenceByGeo({
    rows: [{
      geo: packet.geo,
      current_operational_source_attempt: {
        usable_as_fresh_visual_color_evidence: false,
      },
    }],
  }, {
    rows: [{
      geo: packet.geo,
      status: "VISUALLY_VERIFIED",
      independent_truth_color: "GREEN",
      independent_truth_rule: "GENERAL_OPERATIONAL_PATIENT_ACCESS_MULTI_AXIS",
      independent_conclusion: "Official sources prove the connected patient route.",
      evidence_axes: packet.evidenceAxes,
      verified_sources: packet.currentOfficialSources,
      final_visual_acceptance: {
        status: "PARTIAL_CURRENT_SOURCE_SCREENSHOT_PENDING",
      },
    }],
  });
  const result = buildFreshAxisTruthOverride(evidenceByGeo.get(packet.geo));
  assert.equal(result?.color, "GREEN");
  assert.equal(result?.facts.operational, true);
});

test("direct ledger special-permit evidence remains YELLOW without a patient programme", () => {
  const packet = normalizeVisualReviewLedgerPacket({
    geo: "TEST-SPECIAL-PERMIT-ONLY",
    status: "VISUALLY_VERIFIED",
    independent_truth_color: "YELLOW",
    independent_truth_rule: "GENERAL_SPECIAL_PERMIT_MEDICINAL_PRODUCT_ONLY",
    independent_conclusion: "Official special-permit import evidence is limited and does not prove an operational patient programme.",
    evidence_axes: {
      recreational_possession: "NO",
      recreational_use: "NO",
      special_medical_permit: "YES",
      patient_import_route: "YES",
      programme_operational: "NO_FULL_PATIENT_PROGRAMME",
      pharmacy_or_dispensary: "NO",
    },
    verified_sources: [
      {
        title: "Current official narcotics statute",
        url: "https://legal.example/current-narcotics-statute",
        source_kind: "OFFICIAL_PRIMARY_NARCOTICS_CONTROL_ACT",
        source_authority: "Ministry of Government Legislation",
        facts: ["adult prohibition", "medical exception", "penalty regime"],
        screenshot_path: "evidence/narcotics-statute.png",
      },
      {
        title: "Ministerial special-permit import guide",
        url: "https://regulator.example/special-permit-import",
        source_kind: "OFFICIAL_REGULATOR_SPECIAL_MEDICAL_IMPORT_PERMIT",
        source_authority: "Ministry of Food and Drug Safety",
        facts: ["approval application", "patient import route"],
        screenshot_path: "evidence/special-permit-import.png",
      },
    ],
  });
  const result = buildFreshAxisTruthOverride(packet);
  assert.equal(result?.color, "YELLOW");
  assert.equal(result?.facts.patient, false);
  assert.equal(result?.facts.lawfulRoute, false);
  assert.equal(result?.facts.supply, false);
  assert.equal(result?.facts.operational, false);
});

test("traceable negative recreational and medical axes establish RED without a country override", () => {
  const evidence = {
    reconciliationStatus: "INDEPENDENT_OFFICIAL_LEGAL_REVIEW_COMPLETED",
    independentTruthColor: "RED",
    independentTruthRule: "GENERAL_CURRENT_RECREATIONAL_PROHIBITION_AND_EXPRESS_NON_MEDICAL_CANNABIS_LIST",
    legalInterpretation: "Current official criminal law prohibits possession and current official list expressly excludes medical cannabis use.",
    evidenceAxes: {
      recreational_possession: {
        value: "NO",
        sourceUrl: "https://laws.example.gov/current-criminal-code",
        exactFragment: "Unlawful possession of listed narcotic drugs is criminally punishable.",
      },
      recreational_supply: {
        value: "NO",
        sourceUrl: "https://laws.example.gov/current-criminal-code",
        exactFragment: "Unlawful sale of listed narcotic drugs is criminally punishable.",
      },
      medical_cannabis_access: {
        value: "NO",
        sourceUrl: "https://health.example.gov/current-controlled-list",
        exactFragment: "Cannabis forms are listed as not used for medical purposes.",
      },
    },
    currentOfficialSources: [
      {
        url: "https://laws.example.gov/current-criminal-code",
        sourceType: "CURRENT_PRIMARY_CRIMINAL_CODE",
        sourceOwner: "Official legislature",
        officialHostVerified: true,
        sourceOwnerGeo: "TEST-RED",
        appliesToGeos: ["TEST-RED"],
        screenshot: "evidence/current-criminal-code.png",
        visualReviewed: true,
      },
      {
        url: "https://health.example.gov/current-controlled-list",
        sourceType: "CURRENT_OFFICIAL_CONTROLLED_LIST",
        sourceOwner: "Health ministry",
        officialHostVerified: true,
        sourceOwnerGeo: "TEST-RED",
        appliesToGeos: ["TEST-RED"],
        screenshot: "evidence/current-controlled-list.png",
        visualReviewed: true,
      },
    ],
  };
  assert.equal(buildFreshAxisTruthOverride(evidence)?.color, "RED");
  assert.equal(
    buildFreshAxisTruthOverride({
      ...evidence,
      evidenceAxes: {
        ...evidence.evidenceAxes,
        medical_cannabis_access: { value: "NO" },
      },
    }),
    null,
  );
});

test("nested independent-review ledger packets normalize prefixed axes without a GEO-specific override", () => {
  const packet = normalizeVisualReviewLedgerPacket({
    geo: "TEST-NESTED-INDEPENDENT-REVIEW",
    status: "VISUALLY_VERIFIED",
    conclusion: "Current official sources prove the connected patient route.",
    independent_review: {
      independent_truth_color: "GREEN",
      color_rule: "GENERAL_OPERATIONAL_PATIENT_ACCESS_FROM_CURRENT_MULTISOURCE_AXES",
      evidence_axes: {
        patient_eligible: "YES_PATIENT_HAS_LAWFUL_ACCESS",
        prescriber_route: "YES_DOCTOR_MAY_PRESCRIBE",
        lawful_supply: "YES_LAWFUL_PHARMACY_SUPPLY",
        programme_operational: "YES_CURRENT_OPERATIONAL_ROUTE",
      },
    },
    verified_sources: [
      {
        title: "Health ministry patient and prescription route",
        url: "https://health.example.gov/patient-route",
        source_kind: "OFFICIAL_HEALTH_MINISTRY_PATIENT_ROUTE",
        screenshot_path: "evidence/patient-route.png",
      },
      {
        title: "Health ministry pharmacy supply route",
        url: "https://health.example.gov/pharmacy-supply",
        source_kind: "OFFICIAL_HEALTH_MINISTRY_PHARMACY_SUPPLY",
        screenshot_path: "evidence/pharmacy-supply.png",
      },
    ],
  });
  assert.ok(packet);
  const result = buildFreshAxisTruthOverride(packet);
  assert.equal(result?.color, "GREEN");
  assert.equal(result?.facts.patient, true);
  assert.equal(result?.facts.lawfulRoute, true);
  assert.equal(result?.facts.supply, true);
  assert.equal(result?.facts.operational, true);
});

test("compatible independent evidence packets aggregate while divergent color conclusions stay fail-closed", () => {
  const geo = "TEST-COMPATIBLE-INDEPENDENT-PACKETS";
  const seedRow = { geo, ...operationalPatientEvidence() };
  const compatibleLedger = {
    geo,
    status: "VISUALLY_VERIFIED",
    independent_truth_color: "GREEN",
    independent_truth_rule: "GENERAL_OPERATIONAL_PATIENT_ACCESS_MULTI_AXIS",
    evidence_axes: {
      patient_eligible: "YES_CURRENT_PATIENT_ROUTE",
      prescriber_route: "YES_CURRENT_PRESCRIBER_ROUTE",
      lawful_supply: "YES_CURRENT_LAWFUL_SUPPLY",
      programme_operational: "YES_CURRENT_OPERATIONAL_PROGRAMME",
    },
    verified_sources: [
      {
        title: "Current official patient route",
        url: "https://health.example.gov/current-patient-route",
        source_kind: "OFFICIAL_HEALTH_PATIENT_ROUTE",
        screenshot_path: "evidence/current-patient-route.png",
      },
      {
        title: "Current official lawful supply",
        url: "https://legislation.example/current-lawful-supply",
        source_kind: "OFFICIAL_LAWFUL_SUPPLY_RULE",
        screenshot_path: "evidence/current-lawful-supply.png",
      },
    ],
  };
  const compatible = buildFreshAxisEvidenceByGeo({ rows: [seedRow] }, { rows: [compatibleLedger] }).get(geo);
  assert.equal(compatible?.reconciliationStatus, "FRESH_AXIS_RECONCILED");
  assert.equal(buildFreshAxisTruthOverride(compatible)?.color, "GREEN");

  const divergent = buildFreshAxisEvidenceByGeo({ rows: [seedRow] }, {
    rows: [{ ...compatibleLedger, independent_truth_color: "YELLOW" }],
  }).get(geo);
  assert.equal(divergent?.reconciliationStatus, "FRESH_AXIS_CONFLICT_REQUIRES_REVIEW");
  assert.equal(buildFreshAxisTruthOverride(divergent), null);
});

test("one current primary lawful-possession and personal-cultivation statute can establish legal truth", () => {
  const packet = normalizeVisualReviewLedgerPacket({
    geo: "TEST-ADULT-POSSESSION",
    status: "VISUALLY_VERIFIED",
    independent_truth_color: "GREEN",
    independent_truth_rule: "GENERAL_LAWFUL_ADULT_POSSESSION_GREEN",
    independent_conclusion: "A current primary statute proves lawful adult possession and personal cultivation.",
    evidence_axes: {
      recreational_possession: "YES",
      recreational_cultivation: "YES",
    },
    current_official_sources: [
      {
        title: "State Legislature adult-use statute",
        url: "https://leg.example.gov/adult-use-statute",
        source_type: "STATE_CURRENT_ADULT_USE_STATUTE",
        source_authority: "State Legislature",
        screenshot_path: "evidence/adult-use-statute.png",
        screenshot_valid: true,
        cannabis_fragment_visible: true,
      },
    ],
    final_visual_acceptance: {
      status: "PARTIAL_CURRENT_SOURCE_SCREENSHOT_PENDING",
    },
  });
  assert.ok(packet);
  assert.equal(packet.currentOfficialSources.length, 1);
  assert.equal(buildFreshAxisTruthOverride(packet)?.color, "GREEN");
  assert.equal(
    buildFreshAxisTruthOverride({
      ...packet,
      evidenceAxes: { recreational_cultivation: "YES" },
    }),
    null,
  );
});

test("proven recreational possession and use remain adult-use proof in final reconciliation", () => {
  assert.equal(
    hasProvenAdultUse({
      recreational_possession: { status: "PROVEN" },
      recreational_use: { status: "PROVEN" },
    }, "FRESH_PRIMARY_LAW_AXIS_GREEN"),
    true,
  );
  assert.equal(
    hasProvenAdultUse({
      recreational_possession: { status: "PROVEN" },
      recreational_use: { status: "PROVEN_NO" },
    }, "FRESH_PRIMARY_LAW_AXIS_GREEN"),
    false,
  );
  assert.equal(
    hasProvenAdultUse({
      recreational_possession: { status: "PROVEN" },
      recreational_cultivation: { status: "PROVEN" },
    }, "FRESH_PRIMARY_LAW_AXIS_GREEN"),
    true,
  );
});

test("source-access attempts without structured axes cannot create a truth override", () => {
  assert.equal(buildFreshAxisTruthOverride({
    currentLawAccessAttempt: {
      attempts: [{ result: "TIMEOUT", usable_as_legal_evidence: false }],
    },
  }), null);
});

test("a direct positive-negative axis conflict fails closed", () => {
  const evidence = operationalPatientEvidence({
    independentReview: {
      independentTruthColor: "GREEN",
      evidenceAxes: { lawful_supply: { value: "NO" } },
      currentOfficialSources: [],
    },
  });
  assert.equal(buildFreshAxisTruthOverride(evidence), null);
});

test("project-pair color is not a live map capture", () => {
  assert.equal(hasLiveMapCapture({ source: "PROJECT_PAIR", color: "YELLOW" }), false);
  assert.equal(hasLiveMapCapture({ source: "BROWSER_MAP_VISUAL", color: "YELLOW" }), true);
});

test("uncaptured layers cannot create a map verdict even when proposal colors match", () => {
  const base = {
    previousColor: "YELLOW",
    truthColor: "GREEN",
    truthRuleId: "OPERATIONAL_PATIENT_ACCESS",
    truthReason: "Independent sources prove lawful patient access.",
    layerConflict: true,
    currentMapCaptured: false,
    freshIndependentVisualEvidence: true,
  };
  assert.equal(classifyColorVerdict(base), "INSUFFICIENT_EVIDENCE");
  assert.equal(
    classifyColorVerdict({ ...base, previousColor: "GREEN", truthReason: "Independent official proof." }),
    "INSUFFICIENT_EVIDENCE",
  );
  assert.equal(
    classifyColorVerdict({ ...base, truthReason: "Dependent territory has no unitary regime." }),
    "INSUFFICIENT_EVIDENCE",
  );
});

test("only a captured map color can support a map comparison verdict", () => {
  const base = {
    previousColor: "YELLOW",
    truthColor: "GREEN",
    truthRuleId: "OPERATIONAL_PATIENT_ACCESS",
    truthReason: "Independent sources prove lawful patient access.",
    layerConflict: false,
    currentMapCaptured: true,
    currentMapColor: "GREEN",
    freshIndependentVisualEvidence: true,
  };
  assert.equal(classifyColorVerdict(base), "NO_REAL_DIFFERENCE");
  assert.equal(
    classifyColorVerdict({ ...base, currentMapColor: "YELLOW" }),
    "MAP_WRONG_TRUTH_RIGHT",
  );
});


test("fresh visual evidence requires an explicit official-domain proof for every source", () => {
  const row = {
    truthSource: "FRESH_PRIMARY_LAW_AXIS_RECONCILIATION",
    primaryLaw: {
      freshAxisOfficialSources: [
        { officialOwnerVisible: true, screenshotValid: true },
        { officialOwnerVisible: true, screenshotValid: true, officialDomainVisible: true },
      ],
    },
  };
  assert.equal(hasFreshIndependentVisualEvidence(row), false);
  row.primaryLaw.freshAxisOfficialSources[0].officialDomainVisible = true;
  assert.equal(hasFreshIndependentVisualEvidence(row), true);
});


test("legal truth remains axis-derived when final visual-domain acceptance is incomplete", () => {
  const evidence = operationalPatientEvidence();
  assert.equal(buildFreshAxisTruthOverride(evidence)?.color, "GREEN");
  assert.equal(hasFreshIndependentVisualEvidence({
    truthSource: "FRESH_PRIMARY_LAW_AXIS_RECONCILIATION",
    primaryLaw: {
      freshAxisOfficialSources: [
        { officialOwnerVisible: true, screenshotValid: true },
        { officialOwnerVisible: true, screenshotValid: true },
      ],
    },
  }), false);
});

test("declared official ownership and applicability support legal truth without a final screenshot", () => {
  const evidence = operationalPatientEvidence({
    geo: "TEST",
    validation: { proposalOnly: true },
    officialSources: [
      {
        url: "https://regulator.example/patient-route",
        sourceType: "OFFICIAL_REGULATOR_OPERATIONAL_PATIENT_ROUTE",
        sourceOwner: "Medicinal Cannabis Authority",
        sourceOwnerGeo: "TEST",
        appliesToGeos: ["TEST"],
        officialHostVerified: true,
        facts: ["patient", "prescriber", "registry"],
      },
      {
        url: "https://regulator.example/dispensing-route",
        sourceType: "OFFICIAL_REGULATOR_OPERATIONAL_DISPENSING_ROUTE",
        sourceOwner: "Medicinal Cannabis Authority",
        sourceOwnerGeo: "TEST",
        appliesToGeos: ["TEST"],
        officialHostVerified: true,
        facts: ["supply", "dispensing", "operational"],
      },
    ],
  });
  const result = buildFreshAxisTruthOverride(evidence);
  assert.equal(result?.color, "GREEN");
  assert.equal(result?.facts.operational, true);
  assert.equal(hasFreshIndependentVisualEvidence({
    truthSource: result?.source,
    primaryLaw: { freshAxisOfficialSources: result?.officialSources },
  }), false);
});

test("Virginia lawful adult possession and home cultivation remain GREEN without retail", () => {
  const result = deriveOfficialTruthColor({
    sourceCoverage: "VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW",
    officialStatus: {
      recreational: "LEGAL_FOR_LISTED_ADULT_POSSESSION_USE_HOME_CULTIVATION_AND_NONCOMMERCIAL_TRANSFER",
      medical: "UNCONFIRMED_BY_THIS_ADULT_USE_SECTION",
      enforcement: "SOFT_WITH_STATUTORY_LIMITS",
    },
  });
  assert.equal(result.color, "GREEN");
  assert.equal(result.ruleId, "OFFICIAL_STATUS_RECREATIONAL_LEGAL");
});

test("Washington adult-use law remains GREEN with a distinct medical framework", () => {
  const result = deriveOfficialTruthColor({
    sourceCoverage: "VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW",
    officialStatus: {
      recreational: "LEGAL_ADULT_USE_REGULATED_WITH_LICENSED_RETAIL_FOR_ADULTS_21_AND_OLDER",
      medical: "MEDICAL_CANNABIS_FRAMEWORK_SEPARATE_FROM_ADULT_USE",
      enforcement: "PUBLIC_USE_AND_UNDERAGE_RESTRICTIONS",
    },
  });
  assert.equal(result.color, "GREEN");
  assert.equal(result.ruleId, "OFFICIAL_STATUS_RECREATIONAL_LEGAL");
});

test("decriminalization stays YELLOW when adult use is not lawful", () => {
  const result = deriveOfficialTruthColor({
    sourceCoverage: "VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW",
    officialStatus: {
      recreational: "DECRIMINALIZED_OR_LIMITED_LEGAL_PERSONAL_SCOPE; COMMERCIAL_ADULT_USE_RETAIL_NOT_CONFIRMED",
      medical: "NONE_NO_PATIENT_ACCESS_FOUND",
      enforcement: "ADMINISTRATIVE_FINE",
    },
  });
  assert.equal(result.color, "YELLOW");
  assert.equal(result.ruleId, "OFFICIAL_STATUS_RECREATIONAL_DECRIMINALIZED");
});

test("an unproven medical-access absence cannot create RED", () => {
  const result = deriveOfficialTruthColor({
    sourceCoverage: "VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW",
    officialStatus: {
      recreational: "CANNABIS_POSSESSION_PROHIBITED_BY_CURRENT_STATUTE",
      medical: "NONE_NO_PATIENT_ACCESS_FOUND",
      enforcement: "STRICT",
    },
  });
  assert.equal(result.color, "UNKNOWN");
  assert.equal(result.ruleId, "OFFICIAL_STATUS_INDETERMINATE");
});

test("an explicit current patient-access prohibition can create RED", () => {
  const result = deriveOfficialTruthColor({
    sourceCoverage: "VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW",
    officialStatus: {
      recreational: "CANNABIS_POSSESSION_PROHIBITED_BY_CURRENT_STATUTE",
      medical: "MEDICAL_CANNABIS_PATIENT_ACCESS_PROHIBITED_BY_CURRENT_STATUTE",
      enforcement: "STRICT",
    },
  });
  assert.equal(result.color, "RED");
  assert.equal(result.ruleId, "OFFICIAL_STATUS_PATIENT_ACCESS_NEGATIVE");
});

test("regulated prescription and supply require an operational programme signal for GREEN", () => {
  const result = deriveOfficialTruthColor({
    sourceCoverage: "VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW",
    officialStatus: {
      recreational: "ILLEGAL",
      medical: "REGULATED_PATIENT_PRESCRIPTION_LAWFUL_SUPPLY",
      enforcement: "STRICT",
    },
  });
  assert.equal(result.color, "YELLOW");
  assert.equal(result.ruleId, "OFFICIAL_STATUS_LIMITED_LAWFUL_MODE");
});

test("a cannabis patient-and-supply framework remains YELLOW until operation is proven", () => {
  const result = deriveOfficialTruthColor({
    sourceCoverage: "VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW",
    officialStatus: {
      recreational: "UNCONFIRMED_BY_THIS_ACT",
      medical: "REGULATED_PATIENT_ACCESS_AND_LAWFUL_SUPPLY",
      enforcement: "STRICT",
    },
  });
  assert.equal(result.color, "YELLOW");
  assert.equal(result.ruleId, "OFFICIAL_STATUS_LIMITED_LAWFUL_MODE");
});

test("enacted programme without a lifecycle warning remains YELLOW", () => {
  const result = deriveOfficialTruthColor({
    sourceCoverage: "VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW",
    officialStatus: {
      recreational: "ILLEGAL",
      medical: "LAW_ENACTED_NOT_OPERATIONAL",
      enforcement: "STRICT",
    },
  });
  assert.equal(result.color, "YELLOW");
  assert.equal(result.ruleId, "OFFICIAL_ENACTED_NOT_OPERATIONAL");
});

test("a bill clause cannot erase a separately enacted, not-yet-operational programme", () => {
  const result = deriveOfficialTruthColor({
    sourceCoverage: "VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW",
    officialStatus: {
      recreational: "ILLEGAL",
      medical: "CANNABIS_BILL_2024; LAW_ENACTED_NOT_OPERATIONAL",
      enforcement: "STRICT",
    },
  });
  assert.equal(result.color, "YELLOW");
  assert.equal(result.ruleId, "OFFICIAL_ENACTED_NOT_OPERATIONAL");
});

test("explicit prohibition terminology cannot become decriminalization", () => {
  const result = deriveOfficialTruthColor({
    sourceCoverage: "VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW",
    officialStatus: {
      recreational: "UNLAWFUL_CANNABIS_POSSESSION",
      medical: "MEDICAL_CANNABIS_PATIENT_ACCESS_PROHIBITED_BY_CURRENT_STATUTE",
      enforcement: "STRICT",
    },
  });

  assert.equal(result.color, "RED");
  assert.notEqual(result.ruleId, "OFFICIAL_STATUS_RECREATIONAL_DECRIMINALIZED");
});

test("a current adult-use clause survives adjacent enacted-not-operational context", () => {
  const result = deriveOfficialTruthColor({
    sourceCoverage: "VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW",
    officialStatus: {
      recreational: "LEGAL_ADULT_USE; LAW_ENACTED_NOT_OPERATIONAL",
      medical: "NONE_CONFIRMED_CANNABIS_PROGRAM",
      enforcement: "CURRENT",
    },
  });

  assert.equal(result.color, "GREEN");
  assert.equal(result.ruleId, "OFFICIAL_STATUS_RECREATIONAL_LEGAL");
});


test("claimant-state cannabis law cannot color a disputed territory without direct applicability", () => {
  const result = deriveOfficialTruthColor({
    sourceCoverage: "VISUALLY_VERIFIED_OFFICIAL_CANNABIS_LAW",
    officialStatus: {
      recreational: "CLAIMANT_STATE_DECRIMINALIZED_CANNABIS_LAW",
      medical: "CLAIMANT_STATE_REGULATED_MEDICAL_CANNABIS_FRAMEWORK",
      enforcement: "CLAIMANT_STATE_ENFORCEMENT_CONTEXT",
    },
  });
  assert.equal(result.color, "UNKNOWN");
  assert.equal(result.ruleId, "OFFICIAL_SCOPE_EXCLUSION");
});

test("live browser map evidence is normalized separately from legal truth", () => {
  const screenshot = new URL("./truth_first_reconciliation.test.mjs", import.meta.url).pathname;
  const capture = normalizeLiveMapCapture({
    geo: "TEST",
    capture_status: "LIVE_CAPTURED",
    map_color_bucket: "LIMITED_OR_MEDICAL",
    map_color_evidence: "#f4e9c2",
    map_visual_verdict: "PASS",
    map_screenshot: screenshot,
    runtime_url: "http://127.0.0.1:3000/new-map?qa=1",
    captured_at: "2026-08-02T14:34:27.986Z",
  });
  assert.equal(capture?.color, "YELLOW");
  assert.equal(capture?.source, "BROWSER_MAP_DOM_VISUAL_MANIFEST");
  assert.equal(hasLiveMapCapture(capture), true);
});

test("incomplete map metadata cannot be promoted to a live map capture", () => {
  assert.equal(normalizeLiveMapCapture({
    capture_status: "LIVE_CAPTURED",
    map_color_bucket: "ILLEGAL",
    map_visual_verdict: "PASS",
    map_screenshot: "/missing/evidence.png",
    runtime_url: "http://127.0.0.1:3000/new-map?qa=1",
    captured_at: "2026-08-02T14:34:27.986Z",
  }), null);
});
