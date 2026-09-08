import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analysisBudget } from "./analysis-budget.ts";
import { freezeAnalysisInputs } from "./analysis-inputs.ts";
import { validateRegistryEntry } from "./registry-validation.ts";

test("judge budgets accept multi-hour work and reject invalid values", () => {
  assert.deepEqual(analysisBudget(), { agent_timeout_multiplier: 16 });
  assert.deepEqual(analysisBudget(72), { agent_timeout_multiplier: 144 });
  assert.equal(analysisBudget(0.29).agent_timeout_multiplier * 1800, 1044);
  for (const value of [0, -1, Infinity, NaN, "8", Number.MAX_VALUE]) assert.throws(() => analysisBudget(value));
  validateRegistryEntry("judges", { id: "judge", label: "Judge", agentValue: "codex", timeoutHours: 72 });
  assert.throws(() => validateRegistryEntry("judges", { id: "judge", label: "Judge", agentValue: "codex", timeoutHours: -1 }));
});

test("analysis freezes the Harbor agent budget without imposing verifier or outer timeouts", () => {
  const state = mkdtempSync(join(tmpdir(), "harbor-eval-kit-budget-"));
  const previous = process.env.HARBOR_EVAL_STATE_DIR;
  process.env.HARBOR_EVAL_STATE_DIR = state;
  try {
    const frozen = freezeAnalysisInputs(["analyze", "trial"], 24);
    const config = frozen.args[frozen.args.indexOf("--config") + 1];
    assert.deepEqual(JSON.parse(readFileSync(config, "utf8")), { agent_timeout_multiplier: 48 });
  } finally {
    if (previous === undefined) delete process.env.HARBOR_EVAL_STATE_DIR;
    else process.env.HARBOR_EVAL_STATE_DIR = previous;
    rmSync(state, { recursive: true, force: true });
  }
});
