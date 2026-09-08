import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cliCandidates, createExperimentPlan } from "./experiment-plan.ts";
import { experimentDirectory, prepareExperiment } from "./experiment-store.ts";
import { runExperiment } from "./experiment-runner.ts";
import { openCandidateLog, readCandidateLog } from "./experiment-logs.ts";
import { registerExperimentLogRoutes } from "../experiment-log-routes.ts";

async function withTask(run: (root: string, task: string) => Promise<void> | void): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "hek-experiment-logs-test-"));
  const task = join(root, "task");
  mkdirSync(task);
  writeFileSync(join(task, "task.toml"), "[task]\nname=\"test/task\"\n");
  writeFileSync(join(task, "instruction.md"), "fixture");
  try { await run(root, task); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

test("persists streaming candidate output and runner errors without secrets", async () => {
  await withTask(async (root, task) => {
    const jobsDir = join(root, "jobs");
    const plan = createExperimentPlan({ path: task, jobsDir, runId: "log-contract" }, cliCandidates([{ agent: "oracle", model: null, skillset: { label: "none", paths: [] } }]));
    const secret = ["fixture", "private", "output"].join("-");
    const result = await runExperiment(plan, {
      secrets: { PROVIDER_AUTH: secret },
      executor: async (args, options) => {
        if (args[0] === "--version") return { code: 0, stdout: "Harbor fixture", stderr: "", durationSec: 0 };
        options?.onOutput?.("stdout", `early ${secret}\n`);
        options?.onOutput?.("stderr", "before Harbor job.log\n");
        throw new Error(`executor failed: ${secret}`);
      },
    });
    const candidate = result.rows[0];
    const log = readCandidateLog(jobsDir, plan.id, plan.candidates[0].id, 0)!;
    assert.match(log.content, /\[stdout\] early \[REDACTED\]/);
    assert.match(log.content, /\[stderr\] before Harbor job\.log/);
    assert.match(log.content, /executor failed: \[REDACTED\]/);
    assert.doesNotMatch(log.content, new RegExp(secret));
    assert.equal(log.nextOffset, log.size);
    assert.equal(readCandidateLog(jobsDir, plan.id, plan.candidates[0].id, log.nextOffset)?.content, "");
    assert.match(candidate.error ?? "", /executor failed/);
    assert.doesNotMatch(readFileSync(join(experimentDirectory(jobsDir, plan.id), "experiment.json"), "utf8"), new RegExp(secret));
  });
});

test("candidate log paths reject unsafe IDs and preserve byte offsets", () => {
  const root = mkdtempSync(join(tmpdir(), "hek-experiment-log-path-test-"));
  try {
    const task = join(root, "task");
    mkdirSync(task);
    writeFileSync(join(task, "task.toml"), "[task]\n");
    writeFileSync(join(task, "instruction.md"), "fixture");
    const jobsDir = join(root, "jobs");
    const plan = createExperimentPlan({ path: task, jobsDir, runId: "safe-log" }, cliCandidates([{ agent: "oracle", model: null, skillset: { label: "none", paths: [] } }]));
    prepareExperiment(plan);
    assert.throws(() => openCandidateLog(jobsDir, plan.id, "../escape"), /id inválido/);
    const writer = openCandidateLog(jobsDir, plan.id, plan.candidates[0].id);
    writer.write("stdout", "abc\n");
    const first = readCandidateLog(jobsDir, plan.id, plan.candidates[0].id, 0)!;
    assert.equal(first.content, "[stdout] abc\n");
    assert.equal(readCandidateLog(jobsDir, plan.id, plan.candidates[0].id, 9)!.content, "abc\n");
    writer.write("stdout", "ação 🔑");
    const appended = readCandidateLog(jobsDir, plan.id, plan.candidates[0].id, first.nextOffset)!;
    assert.equal(appended.content, "ação 🔑");
    const middleOfCedilla = first.nextOffset + Buffer.byteLength("a") + 1;
    const utf8Tail = readCandidateLog(jobsDir, plan.id, plan.candidates[0].id, middleOfCedilla)!;
    assert.equal(utf8Tail.content, "ão 🔑");
    assert.ok(!utf8Tail.content.includes("�"));

    let route: ((req: any, res: any, params: Record<string, string>, body: any) => void) | undefined;
    let response: { status: number; data: any } | undefined;
    registerExperimentLogRoutes((_method, _path, handler) => { route = handler; }, (_res, status, data) => { response = { status, data }; });
    route!({ url: `/api/experiments/${plan.id}/logs/${plan.candidates[0].id}?jobsDir=${encodeURIComponent(jobsDir)}&offset=9` }, {}, { id: plan.id, candidateId: plan.candidates[0].id }, {});
    assert.equal(response?.status, 200);
    assert.equal(response?.data.content, "abc\nação 🔑");
    route!({ url: `/api/experiments/${plan.id}/logs/not-a-candidate?jobsDir=${encodeURIComponent(jobsDir)}` }, {}, { id: plan.id, candidateId: "not-a-candidate" }, {});
    assert.equal(response?.status, 404);
    writer.close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});
