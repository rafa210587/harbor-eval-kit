import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { csvEscape, normalizeAnalysis, parseResult, resolveAnalysisArtifact, summarizeAnalysisRecords } from "./results.ts";

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
  writeFileSync(join(dir, "result.json"), JSON.stringify({ finished_at: "2026-09-07T00:00:00", n_total_trials: 4, stats: {
    n_completed_trials: 4, n_errored_trials: 0,
    evals: { a: { n_trials: 1, metrics: [{ mean: 0 }] }, b: { n_trials: 3, metrics: [{ mean: 1 }] } },
  } }));
  const r = parseResult(dir);
  assert.equal(r.meanReward, 0.75);
  assert.equal(r.nTrials, 4);
  assert.equal(r.costUsd, undefined);
  assert.equal(r.nInputTokens, undefined);
  assert.equal(r.error, undefined);
}));

test("result refuses missing completion and inconsistent Harbor trial counts", () => fixture(dir => {
  const stats = { n_completed_trials: 1, n_errored_trials: 0 };
  for (const data of [{ stats }, { stats, finished_at: "" }, { stats, finished_at: "done", n_total_trials: 2 },
    { stats: { ...stats, n_errored_trials: 2 }, finished_at: "done" },
    { stats: { ...stats, n_pending_trials: "0" }, finished_at: "done" }]) {
    writeFileSync(join(dir, "result.json"), JSON.stringify(data));
    assert.ok(parseResult(dir).error);
  }
}));

test("a passing trial cannot hide another trial with absent checks or an error", () => {
  for (const missing of [{}, { checks: {} }, { checks: { x: { outcome: "pass" } }, error: "judge failed" }]) {
    const analysis = normalizeAnalysis({ results: [{ checks: { x: { outcome: "pass" } } }, missing] })!;
    assert.equal(analysis.aggregate.incompleteTrials, 1);
    assert.equal(analysis.aggregate.passRate, undefined);
    assert.equal(summarizeAnalysisRecords([{ ok: true, analysis }]).passRate, undefined);
  }
});

test("CSV exports untrusted formulas as text and keeps numeric and quoted data intact", () => {
  for (const text of ["=1+1", "+1+1", "-1+1", "@SUM(A1)", "  =1", "\tvalue", "\rvalue"]) {
    assert.ok(csvEscape(text).replace(/^"/, "").startsWith("'"));
  }
  assert.equal(csvEscape(-1), "-1");
  assert.equal(csvEscape('a,"b"'), '"a,""b"""');
  assert.equal(csvEscape("a\rb"), '"a\rb"');
});

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

test("single-trial Analyze reads its flat canonical artifact and refuses invalid JSON", () => fixture(dir => {
  const flat = { summary: "trial result", checks: { a: { outcome: "pass" } }, estimated_cost_usd: 0.1 };
  writeFileSync(join(dir, "trial.log"), "trial marker");
  writeFileSync(join(dir, "analysis.json"), JSON.stringify(flat));
  const result = resolveAnalysisArtifact(dir, join(dir, "unused-work-dir"), "unused-job")!;
  assert.equal(result.analysis.summary, "trial result");
  assert.equal(result.analysis.results.length, 1);
  assert.equal(result.analysis.aggregate.costUsd, 0.1);
  writeFileSync(join(dir, "analysis.json"), "broken");
  assert.equal(resolveAnalysisArtifact(dir, dir, "unused-job"), null);
}));

test("Analyze resolves the canonical artifact without depending on wrapped stdout", () => fixture(dir => {
  const inputJob = join(dir, "source-job"), jobsDir = join(dir, "jobs"), reportJob = "analysis-fixed";
  mkdirSync(inputJob);
  writeFileSync(join(inputJob, "analysis.json"), JSON.stringify({ summary: "stale job-level artifact" }));
  mkdirSync(join(jobsDir, reportJob), { recursive: true });
  writeFileSync(join(jobsDir, reportJob, "analysis.json"), JSON.stringify({ results: [{ summary: "from canonical report", checks: { a: { outcome: "pass" } } }] }));
  assert.equal(resolveAnalysisArtifact(inputJob, jobsDir, reportJob)?.analysis.results[0].summary, "from canonical report");

  const missing = resolveAnalysisArtifact(inputJob, jobsDir, "missing-report");
  assert.equal(missing, null);
  writeFileSync(join(jobsDir, reportJob, "analysis.json"), "not json");
  assert.equal(resolveAnalysisArtifact(inputJob, jobsDir, reportJob), null);
}));
