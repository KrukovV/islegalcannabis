import test from "node:test";
import assert from "node:assert/strict";
import {
  MATRIX_RECOVERY_STAGES,
  assertCanRunRecoveryStage,
  recoveryStageStatus
} from "./prod_matrix_recovery.mjs";

test("recovery stage order keeps pass_cycle last", () => {
  assert.equal(MATRIX_RECOVERY_STAGES.at(-1), "pass_cycle");
  assert.throws(() => assertCanRunRecoveryStage("pass_cycle", {
    known_good: true,
    access_probe: true
  }), /RECOVERY_STAGE_BLOCKED/);
  assert.equal(assertCanRunRecoveryStage("pass_cycle", {
    known_good: true,
    access_probe: true,
    screenshot_seed: true,
    short_matrix: true,
    full_matrix: true,
    legacy_prod_audits: true
  }), true);
});

test("full matrix is blocked until short matrix passes", () => {
  assert.throws(() => assertCanRunRecoveryStage("full_matrix", {
    known_good: true,
    access_probe: true,
    screenshot_seed: true
  }), /short_matrix/);
  assert.equal(recoveryStageStatus(["known_good"]).known_good, true);
});
