import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { registerExperimentRoutes } from "../experiment-routes.ts";
import { writeRegistry } from "./paths.ts";
import { createExperimentPlan, cliCandidates } from "./experiment-plan.ts";
import { prepareExperiment } from "./experiment-store.ts";

test("HTTP estimate counts dataset tasks, blocked Compare executes nothing and history reopens snapshot", async () => {
  const root = mkdtempSync(join(tmpdir(), "harbor-eval-kit-route-test-"));
  const previous = process.env.HARBOR_EVAL_STATE_DIR;
  process.env.HARBOR_EVAL_STATE_DIR = join(root, "state");
  try {
    const dataset = join(root, "dataset"), jobsDir = join(root, "jobs"); mkdirSync(dataset);
    for (let i = 0; i < 6; i++) { const path = join(dataset, String(i)); mkdirSync(path); writeFileSync(join(path, "task.toml"), "[task]"); }
    writeRegistry("agents", [{ id: "a", label: "A", agentValue: "mini-swe-agent", modelId: "m" }]);
    writeRegistry("models", [{ id: "m", label: "M", value: "example/model" }]);
    const routes = new Map<string, any>(); let response: any;
    registerExperimentRoutes((method, path, handler) => routes.set(`${method} ${path}`, handler), (_res, status, body) => { response = { status, body }; });
    const body = { path: dataset, jobsDir, entries: [{ agentId: "a", modelId: "" }] };
    await routes.get("POST /api/compare/estimate")({}, {}, {}, body);
    assert.equal(response.body.totalTrials, 6);
    assert.equal(response.body.rows[0].model, "(default)");
    assert.equal(response.body.plan.candidates[0].agent, "mini-swe-agent");
    assert.equal(response.body.plan.tasks.length, 6);
    await assert.rejects(routes.get("POST /api/compare")({}, {}, {}, body), /trials pagos/);
    const plan = createExperimentPlan({ path: join(dataset, "0"), jobsDir, title: "Teste pelo produto", description: "Uma task", baselineIndex: 0 }, cliCandidates([{ agent: "oracle", model: null, skillset: { label: "none", paths: [] } }]));
    prepareExperiment(plan);
    await routes.get("GET /api/experiments/:id")({ url: `/?jobsDir=${encodeURIComponent(jobsDir)}` }, {}, { id: plan.id }, {});
    assert.equal(response.body.plan.id, plan.id);
    assert.equal(response.body.canCancel, false);
    assert.equal(response.body.inputs.length, 1);
    assert.equal(response.body.plan.title, "Teste pelo produto");
    assert.equal(response.body.plan.baselineIndex, 0);
    let downloaded = "";
    const downloadResponse = { writeHead: (code: number, headers: any) => { assert.equal(code, 200); assert.match(headers["Content-Disposition"], /attachment/); }, end: (text: string) => { downloaded = text; } };
    await routes.get("GET /api/experiments/:id/report")({ url: `/?jobsDir=${encodeURIComponent(jobsDir)}&format=csv` }, downloadResponse, { id: plan.id }, {});
    assert.match(downloaded, /^jobName,agent,model/);
    assert.throws(() => createExperimentPlan({ path: dataset, baselineIndex: 7 }, plan.candidates), /baselineIndex/);
    assert.throws(() => createExperimentPlan({ path: dataset, title: "x".repeat(121) }, plan.candidates), /title/);
  } finally {
    if (previous === undefined) delete process.env.HARBOR_EVAL_STATE_DIR; else process.env.HARBOR_EVAL_STATE_DIR = previous;
    rmSync(root, { recursive: true, force: true });
  }
});
