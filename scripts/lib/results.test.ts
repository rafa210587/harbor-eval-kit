import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeAnalysis, parseResult, resolveAnalysisJson, summarizeAnalysisRecords } from "./results.ts";

function fixture(fn: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "hek-results-"));
  try { fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("latest analysis batch excludes older judges, smoke scores and incomplete results", () => {
  const analysis = normalizeAnalysis({ checks: { x: { outcome: "pass" } }, cost_usd: 0.1 });
  const old = { analysisBatchId: "old", analysis: normalizeAnalysis({ checks: { x: { outcome: "fail" } }, cost_usd: 2 }) };
  const latest = { analysisBatchId: "new", analysis };
  assert.deepEqual(summarizeAnalysisRecords([old, latest]), { passRate: 1, judgeCostUsd: 0.1 });
  assert.equal(summarizeAnalysisRecords([{ ...latest, validationMode: true }]).passRate, undefined);
  assert.equal(summarizeAnalysisRecords([latest, { analysisBatchId: "new", ok: false }]).judgeCostUsd, undefined);
  assert.equal(summarizeAnalysisRecords([latest, { analysisBatchId: "new", ok: false }]).passRate, undefined);
  assert.equal(summarizeAnalysisRecords([{ ...latest, analysisBatchSize: 2, analysisBatchIndex: 0 }]).passRate, undefined);
});

test("result missing/malformed/invalid stats reports an error", () => fixture(dir => {
  assert.match(parseResult(dir).error!, /not found/);
  for (const data of ["{", "null", "{}", '{"stats":[]}', '{"stats":{"n_completed_trials":"2"}}']) {
    writeFileSync(join(dir, "result.json"), data);
    assert.ok(parseResult(dir).error);
  }
  for (const stats of [{ n_completed_trials: 0, n_errored_trials: 0 }, { n_completed_trials: 1, n_errored_trials: 0, n_cancelled_trials: 1 }]) {
    writeFileSync(join(dir, "result.json"), JSON.stringify({ stats }));
    assert.ok(parseResult(dir).error);
  }
}));

test("result aggregates rewards by trial count and preserves unknown billing", () => fixture(dir => {
  writeFileSync(join(dir, "result.json"), JSON.stringify({ stats: {
    n_completed_trials: 4, n_errored_trials: 0,
    evals: { a: { n_trials: 1, metrics: [{ mean: 0 }] }, b: { n_trials: 3, metrics: [{ mean: 1 }] } },
  } }));
  const r = parseResult(dir);
  assert.equal(r.meanReward, 0.75);
  assert.equal(r.nTrials, 4);
  assert.equal(r.costUsd, undefined);
  assert.equal(r.nInputTokens, undefined);
}));

test("Analyze preserves all trials and aggregates recognized checks and complete costs", () => {
  const trials = [
    { trial_name: "a", cost_usd: 0, checks: { a: { outcome: "pass" }, b: { outcome: "not_applicable" } } },
    { trial_name: "b", cost_usd: 0.25, checks: { a: { outcome: "fail" }, b: { outcome: "error" } } },
  ];
  const r = normalizeAnalysis({ results: trials })!;
  assert.deepEqual(r.results, trials);
  assert.equal(r.aggregate.nTrials, 2);
  assert.equal(r.aggregate.passRate, undefined);
  assert.equal(r.aggregate.notApplicable, 1);
  assert.equal(r.aggregate.unknown, 1);
  assert.equal(r.aggregate.costUsd, 0.25);
});

test("Analyze partial costs do not masquerade as total and no checks means no pass rate", () => {
  const r = normalizeAnalysis({ results: [{ cost_usd: 0.1 }, {}] })!;
  assert.equal(r.aggregate.costUsd, undefined);
  assert.equal(r.estimated_cost_usd, undefined);
  assert.equal(r.aggregate.reportedCostUsd, 0.1);
  assert.equal(r.aggregate.costReportedTrials, 1);
  assert.equal(r.aggregate.passRate, undefined);
  assert.equal(normalizeAnalysis({ results: [null] }), null);
  assert.equal(normalizeAnalysis([]), null);
  assert.equal(normalizeAnalysis({}), null);
});

test("flat standalone analysis stays compatible; emitted report beats stale direct file", () => fixture(dir => {
  const flat = { summary: "old", checks: { a: { outcome: "pass" } }, estimated_cost_usd: 0.1 };
  writeFileSync(join(dir, "analysis.json"), JSON.stringify(flat));
  assert.equal(resolveAnalysisJson(dir, "")?.summary, "old");
  assert.equal(resolveAnalysisJson(dir, "")?.results.length, 1);
  const report = join(dir, "new report.json");
  writeFileSync(report, JSON.stringify({ results: [{ summary: "new one" }, { summary: "new two" }] }));
  assert.equal(resolveAnalysisJson(dir, `Report: ${report}\n`)?.results.length, 2);
  writeFileSync(report, "broken");
  assert.equal(resolveAnalysisJson(dir, `Report: ${report}`), null);
}));
