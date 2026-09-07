// HTTP adapters for the same experiment domain used by compare-matrix.ts.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentEntry, ModelEntry, SkillEntry, SkillsetEntry } from "./lib/types.ts";
import { readRegistry } from "./lib/paths.ts";
import { createExperimentPlan, resolveRegisteredCandidates, estimateExperiment } from "./lib/experiment-plan.ts";
import { runExperiment, type RunControl } from "./lib/experiment-runner.ts";
import { listExperiments, readExperiment } from "./lib/experiment-store.ts";
import { stopContainersForJob } from "./lib/exec.ts";

type SendJson = (res: ServerResponse, status: number, data: unknown) => void;
type Handler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>, body: any) => void | Promise<void>;
type AddRoute = (method: string, path: string, handler: Handler) => void;
const activeRuns = new Map<string, RunControl>();
export function isExperimentActive(id: string): boolean { return activeRuns.has(id); }

function planFromBody(body: any) {
  const candidates = resolveRegisteredCandidates(body.entries, { agents: readRegistry<AgentEntry>("agents"), models: readRegistry<ModelEntry>("models"), skills: readRegistry<SkillEntry>("skills"), skillsets: readRegistry<SkillsetEntry>("skillsets") });
  return createExperimentPlan(body, candidates);
}

export function registerExperimentRoutes(addRoute: AddRoute, sendJson: SendJson): void {
  addRoute("POST", "/api/compare/estimate", (_req, res, _params, body) => {
    const plan = planFromBody(body);
    sendJson(res, 200, { ...estimateExperiment(plan), nTasks: plan.tasks.length });
  });
  addRoute("POST", "/api/compare", async (_req, res, _params, body) => {
    const plan = planFromBody(body);
    if (activeRuns.has(plan.id)) return sendJson(res, 409, { error: "runId já está em execução" });
    const control: RunControl = { cancelled: false, children: new Set(), jobsDir: plan.jobsDir, jobNames: new Set() };
    activeRuns.set(plan.id, control);
    try { sendJson(res, 200, await runExperiment(plan, { costCapUsd: body.costCapUsd, acknowledgeCost: body.acknowledgeCost, control })); }
    finally { activeRuns.delete(plan.id); }
  });
  addRoute("POST", "/api/compare/cancel", (_req, res, _params, body) => {
    const control = activeRuns.get(String(body.runId ?? ""));
    if (!control) return sendJson(res, 404, { error: "execução não pertence a este processo do servidor; consulte os logs e recursos do job" });
    control.cancelled = true;
    for (const child of control.children) child.kill();
    const stopped = [...control.jobNames].flatMap(name => stopContainersForJob(control.jobsDir, name));
    sendJson(res, 200, { ok: true, stoppedContainers: stopped, note: "cancelamento solicitado; a parada de containers é de melhor esforço e só alcança propriedade comprovada" });
  });
  addRoute("GET", "/api/experiments", (req, res) => {
    const url = new URL(req.url!, "http://localhost");
    sendJson(res, 200, listExperiments(url.searchParams.get("jobsDir") || "jobs"));
  });
  addRoute("GET", "/api/experiments/:id", (req, res, params) => {
    const url = new URL(req.url!, "http://localhost");
    const record = readExperiment(url.searchParams.get("jobsDir") || "jobs", params.id);
    sendJson(res, 200, { ...record, canCancel: activeRuns.has(params.id), executionUncertain: record.status === "running" && !activeRuns.has(params.id) });
  });
}
