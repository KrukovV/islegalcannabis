export const MATRIX_RECOVERY_STAGES = [
  "known_good",
  "access_probe",
  "screenshot_seed",
  "short_matrix",
  "full_matrix",
  "legacy_prod_audits",
  "pass_cycle"
];

const STAGE_REQUIREMENTS = {
  access_probe: ["known_good"],
  screenshot_seed: ["access_probe"],
  short_matrix: ["screenshot_seed"],
  full_matrix: ["short_matrix"],
  legacy_prod_audits: ["full_matrix"],
  pass_cycle: ["legacy_prod_audits"]
};

export function recoveryStageStatus(completed = {}) {
  const done = new Set(
    Array.isArray(completed)
      ? completed
      : Object.entries(completed).filter(([, value]) => Boolean(value)).map(([key]) => key)
  );
  return Object.fromEntries(MATRIX_RECOVERY_STAGES.map((stage) => [stage, done.has(stage)]));
}

export function assertCanRunRecoveryStage(stage, completed = {}) {
  if (!MATRIX_RECOVERY_STAGES.includes(stage)) {
    throw new Error(`UNKNOWN_RECOVERY_STAGE:${stage}`);
  }
  const done = recoveryStageStatus(completed);
  const missing = (STAGE_REQUIREMENTS[stage] || []).filter((required) => !done[required]);
  if (missing.length) {
    const error = new Error(`RECOVERY_STAGE_BLOCKED:${stage}:missing:${missing.join(",")}`);
    error.code = "RECOVERY_STAGE_BLOCKED";
    error.stage = stage;
    error.missing = missing;
    throw error;
  }
  return true;
}
