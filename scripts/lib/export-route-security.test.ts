import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { registerExperimentRoutes } from "../experiment-routes.ts";
import { cliCandidates, createExperimentPlan } from "./experiment-plan.ts";
import { prepareExperiment, writeExperiment } from "./experiment-store.ts";

function setup(rows: any[], secrets: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), "hek-export-route-test-"));
  const task = join(root, "task");
  const jobsDir = join(root, "jobs");
  mkdirSync(task);
  writeFileSync(join(task, "task.toml"), "[task]\n");
  writeFileSync(join(task, "instruction.md"), "fixture");
  const plan = createExperimentPlan({ path: task, jobsDir, runId: "route-export" }, cliCandidates([{ agent: "oracle", model: null, skillset: { label: "none", paths: [] } }]));
  const record = prepareExperiment(plan);
  record.rows = rows;
  writeExperiment(record);
  let reportRoute: any;
  registerExperimentRoutes((_method, path, handler) => { if (path === "/api/experiments/:id/report") reportRoute = handler; }, () => {}, () => secrets);
  return { root, jobsDir, plan, reportRoute };
}

function response() {
  const state: { headers?: Record<string, string>; status?: number; body?: string } = {};
  const res = {
    writeHead(status: number, headers: Record<string, string>) { state.status = status; state.headers = headers; },
    end(body: string) { state.body = body; },
  };
  return { state, res };
}

test("JSON and CSV report routes reject nested credential text before headers", () => {
  const secret = ["synthetic", "route", "secret"].join("-");
  const { root, jobsDir, plan, reportRoute } = setup([{
    jobName: "qa", agent: "oracle", model: "", skillset: "none", ok: false,
    analysis: { nested: { transcript: `analysis leaked ${secret}` } },
  }], { DEEPSEEK_API_KEY: secret });
  try {
    for (const format of ["json", "csv"]) {
      const out = response();
      assert.throws(() => reportRoute({ url: `/api/experiments/${plan.id}/report?jobsDir=${encodeURIComponent(jobsDir)}&format=${format}` }, out.res, { id: plan.id }, {}), /Exportação bloqueada/);
      assert.equal(out.state.status, undefined);
      assert.equal(out.state.body, undefined);
      assert.equal(JSON.stringify(out.state).includes(secret), false);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("CSV report route preserves quoting for ordinary text", () => {
  const { root, jobsDir, plan, reportRoute } = setup([{
    jobName: "qa", agent: "oracle", model: "", skillset: "none", ok: false,
    error: 'mensagem, com "aspas"\nsegunda linha',
  }]);
  try {
    const out = response();
    reportRoute({ url: `/api/experiments/${plan.id}/report?jobsDir=${encodeURIComponent(jobsDir)}&format=csv` }, out.res, { id: plan.id }, {});
    assert.equal(out.state.status, 200);
    assert.equal(out.state.headers?.["Content-Type"], "text/csv; charset=utf-8");
    assert.match(out.state.headers?.["Content-Disposition"] ?? "", /experiment-route-export\.csv/);
    assert.match(out.state.body ?? "", /"mensagem, com ""aspas""\nsegunda linha"/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
