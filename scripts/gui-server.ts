// Harbor Eval Kit - local GUI server.
//
// Plain node:http, no framework, binds 127.0.0.1 only. Serves gui/index.html and a
// small JSON API under /api/* that shells out to `harbor`/`podman`. This must run as a
// local process (not a hosted page) because it needs to reach the local Podman/Harbor
// installation -- a hosted sandboxed page cannot.
//
// Run: node scripts/gui-server.ts [--port 4173]

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { spawn, type ChildProcess } from "node:child_process";
import {
  type AgentEntry,
  type Combo,
  type CriterionEntry,
  type JudgeEntry,
  type ModelEntry,
  type RegistryName,
  type ResultRow,
  type RubricEntry,
  type SkillEntry,
  type SkillsetEntry,
  FREE_AGENTS,
  HARBOR_AGENTS,
  JUDGE_MODELS,
  PROVIDERS,
  buildHarborEnv,
  buildHarborRunArgs,
  deleteSecret,
  execCommand,
  execHarbor,
  getStateDir,
  isHarborAvailable,
  getTaskRubricDefault,
  isJudgeModelAllowed,
  jobName,
  listSecretNames,
  listTasks,
  loadSecretsEnv,
  newId,
  parseAnalysisJson,
  parseResult,
  readRegistry,
  readTaskFiles,
  resolveAgentInstructionsPath,
  getLitellmGatewayConfig,
  getLitellmGatewayPath,
  listJobLogFiles,
  listJobLogs,
  tailJobLog,
  resolveJudgePromptPath,
  resolvePodmanDockerHost,
  resolveRubricCriteria,
  resolveRubricPath,
  setTaskRubricDefault,
  resolveSkillsetPaths,
  runPool,
  sanitize,
  saveSecret,
  testProviderKey,
  writeReport,
  writeRegistry,
  writeTaskFiles,
} from "./lib/harbor.ts";

const GUI_HTML_PATH = join(import.meta.dirname, "..", "gui", "index.html");

// ---------- tiny router ----------

type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  body: any
) => void | Promise<void>;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: Handler;
}

const routes: Route[] = [];

function addRoute(method: string, path: string, handler: Handler): void {
  const paramNames: string[] = [];
  const regexStr = path.replace(/:[^/]+/g, (m) => {
    paramNames.push(m.slice(1));
    return "([^/]+)";
  });
  routes.push({ method, pattern: new RegExp(`^${regexStr}$`), paramNames, handler });
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolvePromise(data));
    req.on("error", reject);
  });
}

async function readJsonBody(req: IncomingMessage): Promise<any> {
  const raw = await readBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON body");
  }
}

// ---------- registries (agents/models/skillsets) ----------

function registryRoutes(name: RegistryName): void {
  addRoute("GET", `/api/${name}`, (_req, res) => {
    sendJson(res, 200, readRegistry(name));
  });
  addRoute("POST", `/api/${name}`, (_req, res, _params, body) => {
    if (!body.label && !body.name) {
      return sendJson(res, 400, { ok: false, error: "label (or name, for criteria) is required" });
    }
    const items = readRegistry<any>(name);
    const item = { id: newId(), ...body };
    items.push(item);
    writeRegistry(name, items);
    sendJson(res, 201, item);
  });
  addRoute("PUT", `/api/${name}/:id`, (_req, res, params, body) => {
    const items = readRegistry<any>(name);
    const idx = items.findIndex((i: any) => i.id === params.id);
    if (idx === -1) return sendJson(res, 404, { ok: false, error: "not found" });
    items[idx] = { ...items[idx], ...body, id: params.id };
    writeRegistry(name, items);
    sendJson(res, 200, items[idx]);
  });
  addRoute("DELETE", `/api/${name}/:id`, (_req, res, params) => {
    const items = readRegistry<any>(name).filter((i: any) => i.id !== params.id);
    writeRegistry(name, items);
    sendJson(res, 200, { ok: true });
  });
}

registryRoutes("agents");
registryRoutes("models");
registryRoutes("skills");
registryRoutes("skillsets");
registryRoutes("criteria");
registryRoutes("rubrics");
registryRoutes("judges");

addRoute("GET", "/api/judge-models", (_req, res) => {
  sendJson(res, 200, JUDGE_MODELS);
});

// ---------- secrets ----------

addRoute("GET", "/api/secrets", (_req, res) => {
  sendJson(res, 200, listSecretNames());
});

addRoute("POST", "/api/secrets", (_req, res, _params, body) => {
  try {
    saveSecret(String(body.name ?? ""), String(body.value ?? ""));
    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendJson(res, 400, { ok: false, error: (err as Error).message });
  }
});

addRoute("DELETE", "/api/secrets/:name", (_req, res, params) => {
  deleteSecret(params.name);
  sendJson(res, 200, { ok: true });
});

addRoute("GET", "/api/providers", (_req, res) => {
  sendJson(res, 200, PROVIDERS);
});

// The `--agent` values the installed Harbor accepts. Served from the one server-side list so
// the Agents/Judges forms can offer real autocomplete instead of asking the user to remember
// 43 adapter names (and to surface which ones can drive an arbitrary provider's model).
addRoute("GET", "/api/harbor-agents", (_req, res) => {
  sendJson(res, 200, { agents: HARBOR_AGENTS, freeAgents: FREE_AGENTS });
});

// ---------- job logs (live tail) ----------

addRoute("GET", "/api/logs/jobs", (req, res) => {
  const url = new URL(req.url ?? "", "http://localhost");
  const jobsDir = url.searchParams.get("jobsDir") || "jobs";
  sendJson(res, 200, listJobLogs(jobsDir));
});

addRoute("GET", "/api/logs/files", (req, res) => {
  const url = new URL(req.url ?? "", "http://localhost");
  const jobsDir = url.searchParams.get("jobsDir") || "jobs";
  const job = url.searchParams.get("job");
  if (!job) return sendJson(res, 400, { ok: false, error: "job query param is required" });
  sendJson(res, 200, listJobLogFiles(jobsDir, job));
});

addRoute("GET", "/api/logs/tail", (req, res) => {
  const url = new URL(req.url ?? "", "http://localhost");
  const jobsDir = url.searchParams.get("jobsDir") || "jobs";
  const job = url.searchParams.get("job");
  const file = url.searchParams.get("file");
  const offset = Number(url.searchParams.get("offset") ?? "0") || 0;
  if (!job || !file) return sendJson(res, 400, { ok: false, error: "job and file query params are required" });
  const tail = tailJobLog(jobsDir, job, file, offset);
  if (!tail) return sendJson(res, 404, { ok: false, error: "log file not found (or outside the jobs dir)" });
  sendJson(res, 200, tail);
});

addRoute("POST", "/api/secrets/test", async (_req, res, _params, body) => {
  const name = String(body.name ?? "");
  const provider = PROVIDERS.find((p) => p.envKey === name);
  if (!provider) {
    return sendJson(res, 400, { ok: false, error: `no known provider maps to the secret name '${name}'` });
  }
  if (!listSecretNames().includes(name)) {
    return sendJson(res, 400, { ok: false, error: `no secret named ${name} is saved yet` });
  }
  const result = await testProviderKey(provider.id, name);
  sendJson(res, result.ok ? 200 : 502, result);
});

// ---------- status / doctor ----------

addRoute("GET", "/api/status", async (_req, res) => {
  const harborAvailable = isHarborAvailable();
  const [harborVersion, podmanVersion, podmanInfo] = await Promise.all([
    harborAvailable ? execHarbor(["--version"]) : Promise.resolve(null),
    execCommand("podman", ["--version"], { dockerHostFix: false }),
    execCommand("podman", ["info"], { dockerHostFix: false }),
  ]);
  sendJson(res, 200, {
    harbor: { available: harborAvailable, version: harborVersion?.stdout.trim() ?? null },
    podman: {
      available: podmanVersion.code === 0,
      version: podmanVersion.code === 0 ? podmanVersion.stdout.trim() : null,
      infoOk: podmanInfo.code === 0,
      dockerHost: resolvePodmanDockerHost(),
    },
    platform: process.platform,
    stateDir: getStateDir(),
    // Integration point, off unless someone deliberately turned it on. Reported so "is model
    // traffic being redirected through a proxy right now?" is answerable without reading files.
    litellmGateway: (() => {
      const cfg = getLitellmGatewayConfig();
      return { enabled: cfg.enabled, baseUrl: cfg.enabled ? cfg.baseUrl : null, configPath: getLitellmGatewayPath() };
    })(),
  });
});

// ---------- compare ----------

addRoute("POST", "/api/compare", async (_req, res, _params, body) => {
  const {
    path: taskPath,
    entries = [],
    env = "docker",
    jobPrefix = "cmp",
    jobsDir = "jobs",
    nAttempts = "1",
    concurrency = 1,
    dryRun = false,
    extra = "",
  } = body;

  if (!taskPath || !Array.isArray(entries) || entries.length === 0) {
    return sendJson(res, 400, { ok: false, error: "path and at least one entry are required" });
  }

  const agentEntries = readRegistry<AgentEntry>("agents");
  const modelEntries = readRegistry<ModelEntry>("models");
  const skillEntries = readRegistry<SkillEntry>("skills");
  const skillsetEntries = readRegistry<SkillsetEntry>("skillsets");

  // Each entry is already a fully-resolved combination -- the UI pre-fills model/skillsetIds
  // from the agent's own defaults and lets the user override per row, so there is no
  // cross-product to compute here (unlike compare-matrix.ts's CLI sweep, which is unaffected).
  type ResolvedCombo = Combo & { agentEntry: AgentEntry };
  const combos: ResolvedCombo[] = [];
  for (const entry of entries as { agentId: string; modelId?: string; skillsetIds?: string[] }[]) {
    const agentEntry = agentEntries.find((a) => a.id === entry.agentId);
    if (!agentEntry) return sendJson(res, 400, { ok: false, error: `unknown agentId: ${entry.agentId}` });

    const modelValue = entry.modelId ? modelEntries.find((m) => m.id === entry.modelId)?.value ?? null : null;
    const skillsetIds = entry.skillsetIds ?? [];
    const skillsetLabel =
      skillsetIds.length > 0
        ? sanitize(
            skillsetIds
              .map((sid) => skillsetEntries.find((s) => s.id === sid)?.label)
              .filter(Boolean)
              .join("+") || "none"
          )
        : "none";
    const skillsetPaths = skillsetIds.flatMap((sid) => {
      const s = skillsetEntries.find((x) => x.id === sid);
      return s ? resolveSkillsetPaths(s.skillIds, skillEntries) : [];
    });
    const instructionsPath = resolveAgentInstructionsPath(agentEntry);
    const paths = [...(instructionsPath ? [instructionsPath] : []), ...skillsetPaths];

    combos.push({
      agent: agentEntry.agentValue,
      model: modelValue,
      skillset: { label: skillsetLabel, paths },
      agentEntry,
    });
  }

  mkdirSync(jobsDir, { recursive: true });
  const extraArgs = extra ? String(extra).split(/\s+/).filter(Boolean) : [];
  const secretsEnv = loadSecretsEnv();
  const concurrencyN = Math.max(1, Number(concurrency) || 1);

  const rows: ResultRow[] = await runPool(combos, concurrencyN, async (c: ResolvedCombo) => {
    const name = jobName(jobPrefix, c);
    const args = buildHarborRunArgs({
      taskPath,
      combo: c,
      jobsDir,
      name,
      env,
      nAttempts: String(nAttempts),
      extra: extraArgs,
      autoYes: true,
      printConfigOnly: Boolean(dryRun),
    });
    const execRes = await execHarbor(args, { extraEnv: secretsEnv });
    const row: ResultRow = {
      jobName: name,
      agent: c.agentEntry.label,
      model: c.model ?? "(default)",
      skillset: c.skillset.label,
      ok: execRes.code === 0,
      durationSec: execRes.durationSec,
    };
    if (execRes.code !== 0) {
      row.error = execRes.stderr.trim().slice(-2000) || `exit ${execRes.code}`;
      return row;
    }
    if (!dryRun) Object.assign(row, parseResult(join(jobsDir, name)));
    return row;
  });

  const outPrefix = join(jobsDir, `${jobPrefix}-report`);
  writeReport(rows, outPrefix);
  sendJson(res, 200, {
    ok: true,
    rows,
    reportJson: `${outPrefix}.json`,
    reportCsv: `${outPrefix}.csv`,
  });
});

// ---------- job history ----------

addRoute("GET", "/api/jobs", (req, res) => {
  const url = new URL(req.url ?? "", "http://localhost");
  const dir = url.searchParams.get("dir") || "jobs";
  if (!existsSync(dir)) return sendJson(res, 200, []);
  const rows = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ jobName: e.name, ...parseResult(join(dir, e.name)) }));
  sendJson(res, 200, rows);
});

// ---------- tasks ----------

addRoute("POST", "/api/tasks/init", async (_req, res, _params, body) => {
  const { name, org, outputDir, description, author, noPytest, noSolution, steps } = body;
  if (!name) return sendJson(res, 400, { ok: false, error: "name is required (org/name format)" });
  const args = ["init", String(name), "--task"];
  if (org) args.push("--org", String(org));
  if (outputDir) args.push("-o", String(outputDir));
  if (description) args.push("--description", String(description));
  if (author) args.push("--author", String(author));
  if (noPytest) args.push("--no-pytest");
  if (noSolution) args.push("--no-solution");
  if (steps) args.push("--steps", String(steps));
  const result = await execHarbor(args, { timeoutMs: 60_000 });
  sendJson(res, result.code === 0 ? 200 : 500, { ok: result.code === 0, ...result });
});

addRoute("GET", "/api/tasks", (_req, res) => {
  sendJson(res, 200, listTasks());
});

addRoute("GET", "/api/tasks/detail", (req, res) => {
  const url = new URL(req.url ?? "", "http://localhost");
  const dir = url.searchParams.get("path");
  if (!dir) return sendJson(res, 400, { ok: false, error: "path query param is required" });
  if (!existsSync(dir)) return sendJson(res, 404, { ok: false, error: "task directory not found" });
  sendJson(res, 200, readTaskFiles(dir));
});

addRoute("POST", "/api/tasks/detail", (_req, res, _params, body) => {
  const { path: dir, instruction, dockerfile, solveSh, testSh } = body;
  if (!dir) return sendJson(res, 400, { ok: false, error: "path is required" });
  if (!existsSync(dir)) return sendJson(res, 404, { ok: false, error: "task directory not found" });
  writeTaskFiles(dir, { instruction, dockerfile, solveSh, testSh });
  sendJson(res, 200, { ok: true });
});

// A rubric's relevance is a property of the task (Python-quality only fits Python tasks),
// not of one Compare session -- so the default judge rubric/model is pinned per task path.
addRoute("GET", "/api/tasks/rubric-default", (req, res) => {
  const url = new URL(req.url ?? "", "http://localhost");
  const dir = url.searchParams.get("path");
  if (!dir) return sendJson(res, 400, { ok: false, error: "path query param is required" });
  sendJson(res, 200, getTaskRubricDefault(dir));
});

addRoute("POST", "/api/tasks/rubric-default", (_req, res, _params, body) => {
  const { path: dir, rubricIds, judgeId } = body;
  if (!dir) return sendJson(res, 400, { ok: false, error: "path is required" });
  setTaskRubricDefault(dir, {
    rubricIds: Array.isArray(rubricIds) && rubricIds.length > 0 ? rubricIds : undefined,
    judgeId: judgeId || undefined,
  });
  sendJson(res, 200, { ok: true });
});

// ---------- datasets ----------

addRoute("GET", "/api/datasets", async (_req, res) => {
  const result = await execHarbor(["dataset", "list"], { timeoutMs: 60_000 });
  sendJson(res, 200, { ok: result.code === 0, stdout: result.stdout, stderr: result.stderr });
});

addRoute("POST", "/api/datasets/download", async (_req, res, _params, body) => {
  const { name, outputDir } = body;
  if (!name) return sendJson(res, 400, { ok: false, error: "name is required" });
  // Default to a predictable "datasets/" folder (listTasks() scans it) instead of the raw
  // cwd Harbor's own CLI default would use, so downloaded tasks are discoverable in the same
  // picker as hand-authored ones without the user having to know where they landed.
  const resolvedOutputDir = outputDir || "datasets";
  const args = ["dataset", "download", String(name), "-o", String(resolvedOutputDir)];
  const result = await execHarbor(args, { timeoutMs: 120_000 });
  sendJson(res, result.code === 0 ? 200 : 500, { ok: result.code === 0, outputDir: resolvedOutputDir, ...result });
});

// ---------- trajectory viewer (long-running child processes) ----------

interface ViewProcess {
  id: string;
  child: ChildProcess;
  url: string | null;
  jobsDir: string;
}

const viewProcesses = new Map<string, ViewProcess>();

addRoute("POST", "/api/view", async (_req, res, _params, body) => {
  const { jobsDir } = body;
  if (!jobsDir) return sendJson(res, 400, { ok: false, error: "jobsDir is required" });

  const id = newId();
  const child = spawn("harbor", ["view", String(jobsDir)], { env: buildHarborEnv() });
  let buffer = "";
  let settled = false;

  const url = await new Promise<string | null>((resolvePromise) => {
    const onData = (d: Buffer) => {
      buffer += d.toString();
      const match = buffer.match(/https?:\/\/\S+/);
      if (match && !settled) {
        settled = true;
        resolvePromise(match[0]);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", () => {
      if (!settled) {
        settled = true;
        resolvePromise(null);
      }
    });
    setTimeout(() => {
      if (!settled) {
        settled = true;
        resolvePromise(null);
      }
    }, 8000);
  });

  viewProcesses.set(id, { id, child, url, jobsDir: String(jobsDir) });
  child.on("exit", () => viewProcesses.delete(id));
  sendJson(res, 200, { ok: true, id, url });
});

addRoute("GET", "/api/view", (_req, res) => {
  sendJson(
    res,
    200,
    Array.from(viewProcesses.values()).map((v) => ({ id: v.id, url: v.url, jobsDir: v.jobsDir }))
  );
});

addRoute("POST", "/api/view/:id/stop", (_req, res, params) => {
  const v = viewProcesses.get(params.id);
  if (!v) return sendJson(res, 404, { ok: false, error: "not found" });
  v.child.kill();
  viewProcesses.delete(params.id);
  sendJson(res, 200, { ok: true });
});

// ---------- analyze ----------

addRoute("POST", "/api/analyze", async (_req, res, _params, body) => {
  const { path: trialPath, rubricId, judgeId, judgeModel, agent } = body;
  if (!trialPath) return sendJson(res, 400, { ok: false, error: "path is required" });

  // Preferred path: a registered Judge bundles agent + model + optional custom prompt.
  // Kept judgeModel/agent as a fallback for ad-hoc use (standalone Analyze tab without a
  // registered Judge) -- same relationship Compare's entries have with bare Agent defaults.
  let resolvedModel = judgeModel ? String(judgeModel) : undefined;
  let resolvedAgent = agent ? String(agent) : undefined;
  let promptPath: string | undefined;
  if (judgeId) {
    const judges = readRegistry<JudgeEntry>("judges");
    const judge = judges.find((j) => j.id === judgeId);
    if (!judge) return sendJson(res, 400, { ok: false, error: "unknown judgeId" });
    const models = readRegistry<ModelEntry>("models");
    resolvedModel = judge.modelId ? models.find((m) => m.id === judge.modelId)?.value : undefined;
    resolvedAgent = judge.agentValue;
    if (judge.promptTemplate && judge.promptTemplate.trim()) {
      promptPath = resolveJudgePromptPath(judge.id, judge.promptTemplate);
    }
  }

  // The curated-model gate exists because a cheap judge defeats the point of judging at all
  // (see JUDGE_MODELS). `validationMode` is a deliberate, per-call escape hatch for smoke-
  // testing that the analyze pipeline itself works without paying for a high-tier model -- it
  // never silently relaxes the gate: the caller has to ask for it, and every response and
  // report from such a call is stamped validationMode:true so its verdict can't be mistaken
  // for a real evaluation.
  const validationMode = Boolean(body.validationMode);
  if (!resolvedModel) {
    return sendJson(res, 400, {
      ok: false,
      error: "the judge has no model set (see GET /api/judge-models for the curated high-tier list)",
    });
  }
  if (!isJudgeModelAllowed(resolvedModel) && !validationMode) {
    return sendJson(res, 400, {
      ok: false,
      error: "the judge's model must be one of the curated high-tier judge models (see GET /api/judge-models), or pass validationMode to smoke-test the pipeline with a non-curated model",
    });
  }

  const args = ["analyze", String(trialPath), "--model", resolvedModel];
  if (rubricId && rubricId !== "__default__") {
    const rubrics = readRegistry<RubricEntry>("rubrics");
    const rubric = rubrics.find((r) => r.id === rubricId);
    if (!rubric) return sendJson(res, 400, { ok: false, error: "unknown rubricId" });
    const criteria = readRegistry<CriterionEntry>("criteria");
    const resolvedCriteria = resolveRubricCriteria(rubric.criterionIds, criteria);
    if (resolvedCriteria.length === 0) {
      return sendJson(res, 400, { ok: false, error: "rubric has no valid criteria" });
    }
    args.push("--rubric", resolveRubricPath(rubric.id, resolvedCriteria));
  }
  if (resolvedAgent) args.push("--agent", resolvedAgent);
  if (promptPath) args.push("--prompt", promptPath);

  const secretsEnv = loadSecretsEnv();
  const result = await execHarbor(args, { extraEnv: secretsEnv, timeoutMs: 120_000 });
  const nonCurated = !isJudgeModelAllowed(resolvedModel);
  sendJson(res, result.code === 0 ? 200 : 500, {
    ok: result.code === 0,
    stdout: result.stdout,
    stderr: result.stderr,
    judgeModel: resolvedModel,
    validationMode: validationMode && nonCurated,
    analysis: result.code === 0 ? parseAnalysisJson(String(trialPath)) : null,
  });
});

// ---------- static + dispatch ----------

async function serveIndex(res: ServerResponse): Promise<void> {
  const html = await readFile(GUI_HTML_PATH, "utf-8");
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

async function dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const pathname = url.pathname;

    if (req.method === "GET" && pathname === "/") {
      await serveIndex(res);
      return;
    }

    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = pathname.match(r.pattern);
      if (!m) continue;
      const params: Record<string, string> = {};
      r.paramNames.forEach((n, i) => (params[n] = decodeURIComponent(m[i + 1])));
      const body = req.method === "POST" || req.method === "PUT" ? await readJsonBody(req) : {};
      await r.handler(req, res, params, body);
      return;
    }

    sendJson(res, 404, { ok: false, error: `no route for ${req.method} ${pathname}` });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: (err as Error).message ?? String(err) });
  }
}

function main(): void {
  const { values } = parseArgs({ options: { port: { type: "string", default: "4173" } } });
  const port = parseInt(values.port ?? "4173", 10);

  const server = createServer((req, res) => {
    void dispatch(req, res);
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`Harbor Eval Kit GUI running at http://127.0.0.1:${port}`);
    console.log(`State dir: ${getStateDir()}`);
    console.log("Press Ctrl+C to stop.");
  });

  process.on("SIGINT", () => {
    for (const v of viewProcesses.values()) v.child.kill();
    server.close(() => process.exit(0));
  });
}

main();
