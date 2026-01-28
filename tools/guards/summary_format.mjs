import fs from "node:fs";

function readArg(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx !== -1) return process.argv[idx + 1] ?? fallback;
  const prefixed = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (prefixed) return prefixed.slice(name.length + 1);
  return fallback;
}

function fail(message) {
  console.error(`ERROR: summary format invalid: ${message}`);
  process.exit(1);
}

const status = readArg("--status", "PASS");
const mode = readArg("--mode", "FULL");
const file = readArg("--file");

if (!file) {
  fail("Missing --file for summary format guard.");
}
if (!fs.existsSync(file)) {
  fail(`Missing summary file: ${file}`);
}

const text = fs.readFileSync(file, "utf8").trimEnd();
const lines = text.split(/\r?\n/);

if ((status === "PASS" || status === "PASS_DEGRADED") && mode === "MVP") {
  const hasCiLine = lines.some((line) => /CI PASS|CI PASS_DEGRADED|CI FAIL/.test(line));
  const egressLine = lines.find((line) => line.startsWith("EGRESS_TRUTH "));
  let egressOnline = null;
  if (egressLine) {
    const match = egressLine.match(/\bonline=(\d)\b/);
    if (match) egressOnline = Number(match[1]);
  }
  const hasQualityDegraded =
    lines.some((line) => line.startsWith("CI_QUALITY=DEGRADED")) ||
    lines.some((line) => /CI_RESULT\b.*\bquality=DEGRADED\b/.test(line));
  const required = [
    { label: "EGRESS_TRUTH", re: /^EGRESS_TRUTH / },
    { label: "WIKI_GATE_OK", re: /^WIKI_GATE_OK=/ },
    { label: "WIKI_SYNC_ALL", re: /^WIKI_SYNC_ALL / },
    { label: "NOTES_TOTAL", re: /^NOTES_TOTAL / },
    { label: "NOTES5_STRICT_RESULT", re: /^NOTES5_STRICT_RESULT / },
    { label: "NOTESALL_STRICT_RESULT", re: /^NOTESALL_STRICT_RESULT / },
    { label: "OFFICIAL_DOMAINS_TOTAL", re: /^OFFICIAL_DOMAINS_TOTAL / },
    { label: "OFFICIAL_COVERAGE", re: /^OFFICIAL_COVERAGE / },
  ];
  if (!hasCiLine) fail("MVP summary missing CI result.");
  for (const item of required) {
    if (!lines.some((line) => item.re.test(line))) {
      fail(`MVP summary missing ${item.label}.`);
    }
  }
  if (egressOnline === 0 && !hasQualityDegraded) {
    fail("MVP summary missing CI_QUALITY=DEGRADED when online=0.");
  }
  process.exit(0);
}

if (status === "PASS" || status === "PASS_DEGRADED") {
  const hasAutoSeed = lines.some((line) => line.startsWith("AUTO_SEED:"));
  const hasScale = lines.some((line) => line.startsWith("SCALE:"));
  const passLine1 = new RegExp("^\\S+ CI PASS(_DEGRADED)? \\(Smoke \\d+/\\d+\\)$");
  const passLine2 = new RegExp("^Checked: \\d+ \\(.+\\)$");
  const passLine3 = new RegExp("^Trends: (skipped|ok rows=50|pending\\(429\\))$");
  const passLine4 = new RegExp("^ISO Coverage: covered=\\d+, missing=\\d+, delta=[+-]?\\d+$");
  const passLine5 = new RegExp(
    "^Law Verified: missing_sources_total=\\d+ missing_sources_delta=[+-]?\\d+( learned_(sources_)?iso=([A-Z]{2}|n/a))?$"
  );
  const passLine6 = new RegExp("^RUN_ID: .+$");
  const passLine7 = new RegExp("^Checkpoint: .checkpoints/.+\\.patch$");
  const autoSeedLine = new RegExp(
    "^AUTO_SEED: added=\\d+ \\(before=\\d+ after=\\d+\\) artifact=Reports/auto_seed/last_seed\\.json$"
  );
  const autoLearnLine = new RegExp(
    "^AUTO_LEARN: discovered=\\d+ validated_ok=\\d+ snapshots=\\d+ first_snapshot_url=.+ first_snapshot_reason=.+ catalog_delta=[+-]?\\d+ learned_iso=.+ reasons_top10=.+$"
  );
  const isoTag = "([A-Z]{2}(?:-[A-Z]{2})?|n/a|N/A)";
  const lawPageDiscoveryLine = new RegExp(
    `^LAW_PAGE_DISCOVERY: iso=${isoTag} law_pages=\\d+ top=.+ reason=.+$`
  );
  const portalsLine = new RegExp(
    "^PORTALS_IMPORT: total=\\d+ added=\\d+ updated=\\d+ missing_iso=\\d+ invalid_url=\\d+ TOP_MISSING_ISO=.+$"
  );
  const lawPageCandidatesLine = new RegExp(
    `^LAW_PAGE_CANDIDATES: iso=${isoTag} total=\\d+ top3=\\[.*\\]$`
  );
  const lawPageOkLine = new RegExp(
    `^LAW_PAGE_OK: iso=${isoTag} ok=\\d+ reason=.+ url=.+$`
  );
  const ocrLine = new RegExp(
    `^OCR: iso=${isoTag} ran=\\d+ engine=.+ pages=\\d+ text_len=\\d+ reason=.+$`
  );
  const cannabisDiscoveryLine = new RegExp(
    `^CANNABIS_DISCOVERY: iso=${isoTag} scanned=\\d+ found_candidates=\\d+ top3=\\[.*\\]$`
  );
  const stagesLine = new RegExp(
    "^STAGES_RAN: cannabis_discovery=\\d+ auto_facts=\\d+ doc_hunt=\\d+ ocr=\\w+ wiki_refresh=\\d+ wiki_query=\\d+ verify=\\d+$"
  );
  const officialScopeLine = new RegExp(
    `^OFFICIAL_SCOPE: iso=${isoTag} roots=\\[.*\\] allowed_hosts_count=\\d+$`
  );
  const expandDetailLine = new RegExp(
    `^EXPAND_DETAIL: iso=${isoTag} list_pages=\\d+ detail_pages=\\d+ top3=\\[.*\\]$`
  );
  const autoLearnMinLine = new RegExp(
    "^AUTO_LEARN_MIN: (0 progress reasons_top10=.+|discovered=\\d+ validated_ok=\\d+ snapshots=\\d+ first_snapshot_url=.+ first_snapshot_reason=.+ catalog_delta=[+-]?\\d+ learned_iso=.+ reasons_top10=.+)$"
  );
  const autoLearnSkippedLine = new RegExp(
    "^AUTO_LEARN: skipped \\((NETWORK=0|AUTO_LEARN=0)\\)$"
  );
  const scaleLine = new RegExp(
    "^SCALE: targets=\\d+ validated_ok=\\d+ snapshots=\\d+ catalog_delta=[+-]?\\d+ evidence_ok=\\d+ machine_verified_delta=[+-]?\\d+ missing_sources_delta=[+-]?\\d+$"
  );
  const docHuntLine = new RegExp(
    `^DOC_HUNT: iso=${isoTag} docs_found=\\d+ docs_snapshotted=\\d+ ocr_ran_count=\\d+$`
  );
  const cannabisDocHuntLine = new RegExp(
    `^CANNABIS_DOC_HUNT: iso=${isoTag} scanned=\\d+ candidates=\\d+ docs_found=\\d+ docs_snapshotted=\\d+$`
  );
  const autoFactsLine = new RegExp(
    `^AUTO_FACTS: iso=${isoTag} pages_checked=\\d+ extracted=\\d+ evidence=\\d+ top_marker_hits=\\[.*\\] reason=.+$`
  );
  const markerHitsTop5Line = new RegExp(
    `^MARKER_HITS_TOP5: iso=${isoTag} top5=\\[.*\\]$`
  );
  const evidenceSnippetGuardLine = new RegExp(
    `^EVIDENCE_SNIPPET_GUARD: iso=${isoTag} tried=\\d+ rejected=\\d+ reasons_top3=.+$`
  );
  const statusClaimLine = new RegExp(
    `^STATUS_CLAIM: iso=${isoTag} type=\\w+ scope=.* conditions=.*$`
  );
  const statusClaimSourceLine = new RegExp(
    "^STATUS_CLAIM_SOURCE: url=.+ (page=.+|anchor=.+|-)$"
  );
  const statusEvidenceLine = new RegExp(
    "^STATUS_EVIDENCE: url=.+ (page=.+|anchor=.+|-) snippet=\".*\"$"
  );
  const statusEvidenceSummaryLine = new RegExp(
    `^STATUS_CLAIM_EVIDENCE_SUMMARY: iso=${isoTag} docs_with_claim=\\d+ evidence_total=\\d+ best_urls=\\[.*\\]$`
  );
  const checkedVerifyLine = new RegExp("^CHECKED_VERIFY: .+$");
  const normativeDocLine = new RegExp(
    `^NORMATIVE_DOC: iso=${isoTag} ok=\\d+ reason=.+$`
  );
  const mvBlockedReasonLine = new RegExp(
    `^MV_BLOCKED_REASON: iso=${isoTag} reason=.+$`
  );
  const autoFactsSkippedLine = new RegExp(
    "^AUTO_FACTS: skipped \\((AUTO_FACTS=0|NETWORK=0)\\)$"
  );
  const autoFactsEvidenceLine = new RegExp(
    `^AUTO_FACTS_EVIDENCE: iso=${isoTag} top=\\[.*\\]$`
  );
  const autoFactsEvidenceBestLine = new RegExp(
    `^AUTO_FACTS_EVIDENCE_BEST: iso=${isoTag} url=.+ (page=.+|anchor=.+|-) marker=.+ snippet=\".*\"$`
  );
  const machineLine = new RegExp(
    "^Machine Verified: total=\\d+ delta=[+-]?\\d+ evidence_ok=\\d+$"
  );
  const mvLine = new RegExp(
    `^MV: iso=${isoTag} delta=[+-]?\\d+ evidence=\\d+ docs=\\d+ confidence=.+ reason=.+$`
  );
  const mvWriteLine = new RegExp(
    "^MV_WRITE: before=\\d+ after=\\d+ added=\\d+ removed=\\d+ reason=.+$"
  );
  const mvStoreLine = new RegExp(
    "^MV_STORE: before=\\d+ added=\\d+ removed=\\d+ after=\\d+ wrote=(data/legal_ssot/machine_verified\\.json|SKIPPED)$"
  );
  const autoTrainLine = new RegExp(
    "^AUTO_TRAIN: targets=\\d+ validated=\\d+ snap=\\d+ law_pages=\\d+ evidence_ok=\\d+ mv_delta=[+-]?\\d+ cand_delta=[+-]?\\d+ missing_sources=[+-]?\\d+$"
  );
  const blockerLine = new RegExp(
    "^BLOCKER_SUMMARY: SNAPSHOT=(OK|0) DOC=(OK|0) MARKER=(OK|NO_MARKER) EVIDENCE=(OK|NO_EVIDENCE) LAW_PAGE=(OK|NO_LAW_PAGE)$"
  );
  const whereLine = new RegExp(
    "^WHERE: auto_train=Reports/auto_train/last_run.json auto_learn=Reports/auto_learn/last_run.json auto_facts=Reports/auto_facts/last_run.json auto_verify=Reports/auto_verify/last_run.json portals_import=Reports/portals_import/last_run.json mv=data/legal_ssot/machine_verified.json snapshots=data/source_snapshots$"
  );
  if (!passLine1.test(lines[0])) fail("PASS line 1 missing CI PASS.");
  if (!passLine2.test(lines[1])) fail("PASS line 2 missing Checked.");
  if (!passLine3.test(lines[2])) fail("PASS line 3 missing Trends.");
  if (!passLine4.test(lines[3])) fail("PASS line 4 missing ISO Coverage.");
  if (!passLine5.test(lines[4])) fail("PASS line 5 missing Law Verified.");
  if (!passLine6.test(lines[5])) fail("PASS line 6 missing RUN_ID.");
  let cursor = 5;
  const seek = (pattern, label) => {
    for (let i = cursor + 1; i < lines.length; i += 1) {
      if (pattern.test(lines[i])) {
        cursor = i;
        return;
      }
    }
    fail(`PASS line missing ${label}.`);
  };
  const seekAny = (patterns, label) => {
    for (let i = cursor + 1; i < lines.length; i += 1) {
      if (patterns.some((pattern) => pattern.test(lines[i]))) {
        cursor = i;
        return;
      }
    }
    fail(`PASS line missing ${label}.`);
  };
  if (hasAutoSeed) seek(autoSeedLine, "AUTO_SEED");
  seekAny([autoLearnLine, autoLearnMinLine, autoLearnSkippedLine], "AUTO_LEARN");
  seek(lawPageDiscoveryLine, "LAW_PAGE_DISCOVERY");
  seek(portalsLine, "PORTALS_IMPORT");
  seek(lawPageCandidatesLine, "LAW_PAGE_CANDIDATES");
  seek(lawPageOkLine, "LAW_PAGE_OK");
  seek(ocrLine, "OCR");
  seek(stagesLine, "STAGES_RAN");
  seek(officialScopeLine, "OFFICIAL_SCOPE");
  seek(cannabisDiscoveryLine, "CANNABIS_DISCOVERY");
  seek(expandDetailLine, "EXPAND_DETAIL");
  seek(docHuntLine, "DOC_HUNT");
  seek(cannabisDocHuntLine, "CANNABIS_DOC_HUNT");
  if (hasScale) seek(scaleLine, "SCALE");
  seek(autoFactsLine, "AUTO_FACTS");
  seek(evidenceSnippetGuardLine, "EVIDENCE_SNIPPET_GUARD");
  seek(statusClaimLine, "STATUS_CLAIM");
  seek(statusClaimSourceLine, "STATUS_CLAIM_SOURCE");
  seek(statusEvidenceLine, "STATUS_EVIDENCE");
  seek(statusEvidenceSummaryLine, "STATUS_CLAIM_EVIDENCE_SUMMARY");
  seek(normativeDocLine, "NORMATIVE_DOC");
  seek(mvBlockedReasonLine, "MV_BLOCKED_REASON");
  seek(markerHitsTop5Line, "MARKER_HITS_TOP5");
  seek(autoFactsEvidenceLine, "AUTO_FACTS_EVIDENCE");
  seek(autoFactsEvidenceBestLine, "AUTO_FACTS_EVIDENCE_BEST");
  seek(checkedVerifyLine, "CHECKED_VERIFY");
  seek(machineLine, "Machine Verified");
  seek(mvLine, "MV");
  seek(mvWriteLine, "MV_WRITE");
  seek(mvStoreLine, "MV_STORE");
  seek(autoTrainLine, "AUTO_TRAIN");
  seek(blockerLine, "BLOCKER_SUMMARY");
  seek(whereLine, "WHERE");
  seek(passLine7, "Checkpoint");
  if (/\\n\\s*1\\./.test(text)) fail("PASS summary uses 1. instead of 1).");
} else {
  if (lines.length !== 3) fail("FAIL summary must have 3 lines.");
  const failLine1 = new RegExp("^❌ CI FAIL$");
  const failLine2 = new RegExp("^Reason: .+");
  const failLine3 = new RegExp("^Retry: bash tools\\/(ci-local|pass_cycle)\\.sh$");
  if (!failLine1.test(lines[0])) fail("FAIL line 1 missing ❌ CI FAIL.");
  if (!failLine2.test(lines[1])) fail("FAIL line 2 missing Reason.");
  if (!failLine3.test(lines[2])) fail("FAIL line 3 missing Retry.");
}
