import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createExperimentPlan, cliCandidates, resolveRegisteredCandidates, estimateExperiment, guardExperiment, parseExperimentExtra, MAX_JOB_PATH_LENGTH } from "./experiment-plan.ts";
import { runExperiment } from "./experiment-runner.ts";
import { readExperiment, prepareExperiment, appendExperimentAnalysis, experimentDirectory } from "./experiment-store.ts";
import { normalizeAnalysis } from "./results.ts";
import { buildHarborEnv } from "./exec.ts";
import { compactJobName } from "./naming.ts";

async function fixture(fn: (root: string, task: string) => unknown) {
  const root = mkdtempSync(join(tmpdir(), "harbor-eval-kit-experiment-test-"));
  const task = join(root, "task"); mkdirSync(task);
  writeFileSync(join(task, "task.toml"), '[task]\nname="test/task"\n');
  writeFileSync(join(task, "instruction.md"), "original instruction");
  try { await fn(root, task); }
  finally {
    assert.ok(resolve(root).startsWith(resolve(tmpdir())) && root.includes("harbor-eval-kit-experiment-test-"));
    rmSync(root, { recursive: true, force: true });
  }
}
const combo = { agent: "mini-swe-agent", model: "deepseek/deepseek-chat", skillset: { label: "none", paths: [] } };
const registries = { agents: [{ id: "a", label: "Agent A", agentValue: "mini-swe-agent", modelId: "m", instructions: "first" }], models: [{ id: "m", label: "model", value: "deepseek/deepseek-chat" }], skills: [], skillsets: [] };

test("new executions and duplicate profiles have different job identities", () => fixture((root, task) => {
  const candidates = resolveRegisteredCandidates([{ agentId: "a" }, { agentId: "a" }], registries);
  const a = createExperimentPlan({ path: task, jobsDir: join(root, "jobs") }, candidates);
  const b = createExperimentPlan({ path: task, jobsDir: join(root, "jobs") }, candidates);
  assert.notEqual(a.candidates[0].jobName, a.candidates[1].jobName);
  assert.notEqual(a.candidates[0].jobName, b.candidates[0].jobName);
  assert.equal(a.candidates[0].profileId, "a");
}));

test("generated job names stay short while the plan retains long candidate metadata", () => fixture((root, task) => {
  const longCandidate = {
    agent: `agent-${"x".repeat(140)}`,
    model: `provider/${"model-".repeat(35)}`,
    label: "long candidate",
    skillset: { label: `skill-${"s".repeat(140)}`, paths: [] },
    skills: [],
  };
  const runId = "80c5f48e-b827-4759-878f-0bd2da19d3d8";
  const plan = createExperimentPlan({
    path: task,
    jobsDir: join(root, "jobs"),
    jobPrefix: "a-very-long-project-prefix-that-is-readable",
    runId,
  }, [longCandidate]);
  const candidate = plan.candidates[0];
  assert.ok(candidate.jobName.length < 70);
  assert.equal(candidate.jobName, `a-very-long-proj-${runId}-c1`);
  assert.equal(candidate.model, longCandidate.model);
  assert.equal(candidate.skillset.label, longCandidate.skillset.label);
  assert.ok(join(plan.jobsDir, candidate.jobName).length <= MAX_JOB_PATH_LENGTH);
}));

test("a jobs-dir that would exceed the Windows path budget fails before trial preparation", () => fixture((root, task) => {
  const longJobsDir = join(root, "jobs-" + "deep-".repeat(55));
  assert.throws(() => createExperimentPlan({ path: task, jobsDir: longJobsDir }, cliCandidates([combo])), /caminho .* excede.*encurte jobs-dir/i);
}));

test("a long task name is rejected against the full trial artifact path", () => fixture((root) => {
  const longTask = join(root, `task-${"deep-".repeat(35)}`);
  mkdirSync(longTask);
  writeFileSync(join(longTask, "task.toml"), '[task]\nname="long/task"\n');
  assert.throws(() => createExperimentPlan({ path: longTask, jobsDir: join(root, "jobs") }, cliCandidates([combo])), /caminho de trial\/artefatos excede.*encurte jobs-dir ou task/i);
}));

test("custom maximum-length run ids use a bounded collision-resistant suffix", () => {
  const first = compactJobName("cmp", { runId: "r" + "a".repeat(127), candidateIndex: 1 });
  const second = compactJobName("cmp", { runId: "r" + "b".repeat(127), candidateIndex: 1 });
  assert.ok(first.length <= 70);
  assert.notEqual(first, second);
});

test("preview and run share explicit-empty model semantics and reject missing references", () => {
  assert.equal(resolveRegisteredCandidates([{ agentId: "a" }], registries)[0].model, combo.model);
  assert.equal(resolveRegisteredCandidates([{ agentId: "a", modelId: "" }], registries)[0].model, null);
  assert.throws(() => resolveRegisteredCandidates([{ agentId: "a", modelId: "missing" }], registries), /modelId/);
  assert.throws(() => resolveRegisteredCandidates([{ agentId: "a", skillsetIds: ["missing"] }], registries), /skillsetId/);
});

test("dataset volume triggers blind guard while dry run never spends", () => fixture((root, task) => {
  const dataset = join(root, "dataset"); mkdirSync(dataset);
  for (let i = 0; i < 6; i++) { const dir = join(dataset, `t${i}`); mkdirSync(dir); writeFileSync(join(dir, "task.toml"), "[task]"); }
  const plan = createExperimentPlan({ path: dataset, jobsDir: join(root, "jobs") }, cliCandidates([combo]));
  assert.equal(estimateExperiment(plan).totalTrials, 6);
  assert.equal(guardExperiment(plan, 0, false).allowed, false);
  assert.equal(guardExperiment({ ...plan, dryRun: true }, 0, false).allowed, true);
  assert.throws(() => createExperimentPlan({ path: task, nAttempts: "1x" }, cliCandidates([combo])), /inteiro/);
  assert.throws(() => guardExperiment(plan, "invalid", false), /teto/);
}));

test("CLI raw model matches sanitized historical cost and ignores live cost", () => fixture((root, task) => {
  const jobs = join(root, "jobs"), old = join(jobs, "old__agent-mini-swe-agent__model-deepseek-deepseek-chat__skill-none"); mkdirSync(old, { recursive: true });
  const data = { finished_at: "done", n_total_trials: 2, stats: { cost_usd: 1 } };
  writeFileSync(join(old, "result.json"), JSON.stringify(data));
  const plan = createExperimentPlan({ path: task, jobsDir: jobs, nAttempts: 2 }, cliCandidates([combo]));
  assert.equal(estimateExperiment(plan).estimateUsd, 1);
  writeFileSync(join(old, "result.json"), JSON.stringify({ ...data, finished_at: null }));
  assert.equal(estimateExperiment(plan).estimateUsd, null);
}));

test("extra args cannot override protected dimensions or embed credentials", () => {
  assert.deepEqual(parseExperimentExtra("--ak max_tokens=1024"), ["--ak", "max_tokens=1024"]);
  assert.throws(() => parseExperimentExtra("--ak max_tokens=invalid"), /inteiro/);
  for (const raw of ["--n-attempts 30", "-k30", "--model=x", "--config x", "--path other", "--retry 30", "--ak api_key=value", "--print-config", "--ak 'unterminated"]) assert.throws(() => parseExperimentExtra(raw));
  assert.deepEqual(parseExperimentExtra('--ak "system_prompt=use spaces" --timeout-multiplier 1.5'), ["--ak", "system_prompt=use spaces", "--timeout-multiplier", "1.5"]);
  for (const key of ["api_key", "authorization", "access_token", "client_secret"]) {
    assert.throws(() => parseExperimentExtra(`--ak config='{"model":{"${key}":"fixture-value"}}'`), /credencial/);
  }
  assert.throws(() => parseExperimentExtra("--ak config='{broken}'"), /JSON válido/);
  assert.doesNotThrow(() => parseExperimentExtra('--ak config=\'{"model":{"model_kwargs":{"max_tokens":100}},"agent":{"step_limit":5}}\''));
});

test("known credentials in any plan input are refused before snapshot or subprocess", () => fixture(async (root, task) => {
  const plan = createExperimentPlan({ path: task, jobsDir: join(root, "jobs"), description: "private fixture-value" }, cliCandidates([combo]));
  let calls = 0;
  await assert.rejects(runExperiment(plan, { secrets: { PROVIDER_AUTH: "fixture-value" }, executor: async () => {
    calls++; return { code: 0, stdout: "", stderr: "", durationSec: 0 };
  } }), /credencial encontrada/);
  assert.equal(calls, 0);
  assert.equal(existsSync(experimentDirectory(plan.jobsDir, plan.id)), false);
}));

test("snapshots retain task and authored skill inputs after source edits; duplicate ID refuses reuse", () => fixture((root, task) => {
  const plan = createExperimentPlan({ path: task, jobsDir: join(root, "jobs") }, resolveRegisteredCandidates([{ agentId: "a" }], registries));
  const record = prepareExperiment(plan);
  writeFileSync(join(task, "instruction.md"), "edited");
  assert.equal(readFileSync(join(record.plan.taskPath, "instruction.md"), "utf8"), "original instruction");
  assert.equal(readFileSync(join(record.plan.candidates[0].skillset.paths[0], "SKILL.md"), "utf8"), "first");
  assert.ok(record.inputs.every(i => /^[a-f0-9]{64}$/.test(i.sha256)));
  assert.throws(() => prepareExperiment(plan), /EEXIST/);
}));

test("runner executes snapshot with secrets only in env; saved reports rehydrate analysis", () => fixture(async (root, task) => {
  const plan = createExperimentPlan({ path: task, jobsDir: join(root, "jobs") }, cliCandidates([combo]));
  const credential = "fixture-value";
  const seen: string[][] = [];
  const result = await runExperiment(plan, { secrets: { PROVIDER_AUTH: credential }, executor: async (args, opts) => {
    seen.push(args);
    if (args[0] === "run") {
      assert.equal(opts?.extraEnv?.PROVIDER_AUTH, credential);
      assert.ok(!args.join(" ").includes(credential));
      assert.notEqual(args[args.indexOf("--path") + 1], task);
      const job = join(plan.jobsDir, args[args.indexOf("--job-name") + 1]); mkdirSync(job);
      writeFileSync(join(job, "result.json"), JSON.stringify({ finished_at: "done", stats: { n_completed_trials: 1, n_errored_trials: 0, evals: { e: { n_trials: 1, metrics: [{ mean: 1 }] } } } }));
    }
    return { code: 0, stdout: "Harbor fixture", stderr: "", durationSec: 1 };
  } });
  assert.equal(seen.length, 2);
  assert.equal(result.rows[0].ok, true);
  assert.equal(result.rows[0].costUsd, undefined);
  assert.equal(readExperiment(plan.jobsDir, plan.id).status, "finished");
  const analysis = normalizeAnalysis({ checks: { clean: { outcome: "pass" } }, cost_usd: 0.1 });
  appendExperimentAnalysis(plan.jobsDir, plan.id, result.rows[0].jobName, { analysis, analysisBatchId: "batch", validationMode: false }, { PROVIDER_AUTH: credential });
  const reopened = readExperiment(plan.jobsDir, plan.id);
  assert.equal(reopened.rows[0].passRate, 1);
  assert.equal(reopened.rows[0].judgeCostUsd, 0.1);
  assert.ok(readFileSync(result.reportCsv, "utf8").includes("judgeCostUsd"));
  assert.ok(!readFileSync(join(experimentDirectory(plan.jobsDir, plan.id), "experiment.json"), "utf8").includes(credential));
}));

test("blocked plan spawns nothing; missing result and cancelled rows are failures", () => fixture(async (root, task) => {
  const plan = createExperimentPlan({ path: task, jobsDir: join(root, "jobs"), nAttempts: 6 }, cliCandidates([combo]));
  let calls = 0;
  const executor = async () => { calls++; return { code: 0, stdout: "fixture", stderr: "", durationSec: 0 }; };
  await assert.rejects(runExperiment(plan, { executor, secrets: {} }), /trials pagos/);
  assert.equal(calls, 0);
  assert.equal(existsSync(experimentDirectory(plan.jobsDir, plan.id)), false);
  const missing = await runExperiment({ ...plan, nAttempts: 1 }, { executor, secrets: {} });
  assert.equal(missing.rows[0].ok, false);
  assert.match(missing.rows[0].error!, /not found/);
  const cancelled = await runExperiment({ ...plan, id: "cancelled", nAttempts: 1 }, { executor, secrets: {}, control: { cancelled: true, children: new Set(), jobsDir: plan.jobsDir, jobNames: new Set() } });
  assert.equal(cancelled.cancelled, true);
  assert.match(cancelled.rows[0].error!, /cancelado/);
}));

test("telemetry cannot be reenabled through per-call environment", () => {
  assert.equal(buildHarborEnv({ HARBOR_TELEMETRY: "enabled", DOCKER_HOST: "fixture" }, {}).HARBOR_TELEMETRY, "disabled");
});
