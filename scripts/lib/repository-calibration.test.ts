import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCalibrationResults } from "./repository-calibration.ts";

test("calibration requires complete reference success and an informative baseline", () => {
  const base = { meanReward: 0, nTrials: 1, nErrors: 0 };
  const reference = { ...base, meanReward: 1 };
  assert.doesNotThrow(() => validateCalibrationResults(base, reference));
  assert.throws(() => validateCalibrationResults(base, base), /gabarito/);
  assert.throws(() => validateCalibrationResults(reference, reference), /base já passa/);
  assert.doesNotThrow(() => validateCalibrationResults(reference, reference, true));
  for (const broken of [{}, { ...base, meanReward: undefined }, { ...base, nErrors: 1 }, { ...base, nTrials: 0 }, { ...base, meanReward: 0.5 }]) {
    assert.throws(() => validateCalibrationResults(broken, reference, true), /completo/);
    assert.throws(() => validateCalibrationResults(base, broken, true), /completo/);
  }
});
