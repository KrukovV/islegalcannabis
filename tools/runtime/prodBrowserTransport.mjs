const JS_REPL_REMOVED_STATUS = Object.freeze({
  status: "REMOVED_UPSTREAM",
  feature_enabled: 0,
  session_tool_available: 0,
  session_tool_observed: 0,
  session_tool_source: "removed_upstream",
  browser_runtime_attached: 0,
  browser_runtime_attached_observed: 0,
  browser_runtime_attached_source: "removed_upstream",
  playwright_browser_launch_ok: 0,
  playwright_browser_launch_observed: 0,
  playwright_browser_launch_source: "removed_upstream",
  browser_transport_bridge_ready: 0,
  browser_transport_bridge_observed: 0,
  browser_transport_bridge_source: "removed_upstream",
  evidence_complete: 1,
  ready: 0,
  root_cause: "JS_REPL_REMOVED_UPSTREAM",
  browser_use_present: 1,
  in_app_browser_present: 1,
  app_server_available: 0,
  config_path: "",
  runtime_path: ""
});

export function rate(numerator, denominator) {
  const total = Number(denominator || 0);
  if (!total) return 0;
  return Number((Number(numerator || 0) / total).toFixed(4));
}

function combination(n, k) {
  if (k < 0 || k > n) return 0;
  const limit = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= limit; index += 1) {
    result = result * (n - limit + index) / index;
  }
  return result;
}

function hypergeometric(a, row1, col1, total) {
  return combination(col1, a) * combination(total - col1, row1 - a) / combination(total, row1);
}

export function fisherExactLess({ groupAChallengeCount, groupATotal, groupBChallengeCount, groupBTotal }) {
  const aChallenges = Number(groupAChallengeCount || 0);
  const aTotal = Number(groupATotal || 0);
  const bChallenges = Number(groupBChallengeCount || 0);
  const bTotal = Number(groupBTotal || 0);
  const total = aTotal + bTotal;
  const challengeTotal = aChallenges + bChallenges;
  if (!aTotal || !bTotal || !total) return 1;

  const observedA = aChallenges;
  const minA = Math.max(0, challengeTotal - bTotal);
  const maxA = Math.min(aTotal, challengeTotal);
  let p = 0;
  for (let candidateA = observedA; candidateA <= maxA; candidateA += 1) {
    if (candidateA < minA) continue;
    p += hypergeometric(candidateA, aTotal, challengeTotal, total);
  }
  return Number(Math.min(1, p).toFixed(6));
}

export function decideJsReplBrowserMode({ groupA, groupB }) {
  if (!groupA || !groupB || !groupB.js_repl_executed) {
    return {
      mode: "REMOVED_UPSTREAM",
      reason: "JS_REPL_REMOVED_UPSTREAM",
      p_value: null,
      statistically_significant: false,
      removed_upstream: true
    };
  }

  const pValue = fisherExactLess({
    groupAChallengeCount: groupA.challenge_count,
    groupATotal: groupA.operation_count,
    groupBChallengeCount: groupB.challenge_count,
    groupBTotal: groupB.operation_count
  });
  const lowerChallengeRate = Number(groupB.challenge_rate) < Number(groupA.challenge_rate);
  const significant = lowerChallengeRate && pValue < 0.05;
  return {
    mode: significant ? "PRIMARY" : "OPTIONAL",
    reason: significant
      ? "JS_REPL_CHALLENGE_RATE_LOWER_WITH_FISHER_EXACT_P_LT_0_05"
      : "JS_REPL_CHALLENGE_RATE_NOT_SIGNIFICANTLY_LOWER",
    p_value: pValue,
    statistically_significant: significant
  };
}

export async function detectJsReplRuntime(repoRoot = process.cwd()) {
  void repoRoot;
  return { ...JS_REPL_REMOVED_STATUS };
}

export async function resolveBrowserExecutionPath({
  repoRoot = process.cwd(),
  requestedMode = process.env.JS_REPL_BROWSER_MODE || process.env.PROD_BROWSER_EXECUTION_PATH || "first"
} = {}) {
  const normalized = String(requestedMode || "first").toLowerCase();
  const jsRepl = await detectJsReplRuntime(repoRoot);
  const jsReplRequested = !["playwright", "playwright_runner", "runner", "off", "0"].includes(normalized);
  const selectedPath = "playwright_runner";
  const fallback = true;
  return {
    requested_mode: requestedMode,
    selected_path: selectedPath,
    JS_REPL_STATUS: jsRepl.status,
    JS_REPL_BROWSER_MODE: "FALLBACK_PLAYWRIGHT_RUNNER",
    js_repl_requested: jsReplRequested,
    js_repl_executed: false,
    fallback_used: fallback,
    fallback_reason: jsRepl.root_cause,
    js_repl: jsRepl,
    ownership: {
      qa_owner: "tools_and_reports",
      artifacts_depend_on_interactive_session: false
    }
  };
}

export function reuseMetrics({ browserReused, contextReused, sessionReused, operationCount, successCount, challengeCount }) {
  const operations = Number(operationCount || 0);
  const successes = Number(successCount || 0);
  const challenges = Number(challengeCount || 0);
  return {
    BROWSER_REUSE_EFFECT: browserReused ? "REUSED" : "NOT_REUSED",
    CONTEXT_REUSE_EFFECT: contextReused ? "REUSED" : "NOT_REUSED",
    SESSION_REUSE_EFFECT: sessionReused ? "REUSED" : "NOT_REUSED",
    SUCCESS_COUNT: successes,
    CHALLENGE_COUNT: challenges,
    OPERATION_COUNT: operations,
    SUCCESS_RATE: rate(successes, operations),
    CHALLENGE_RATE: rate(challenges, operations)
  };
}
