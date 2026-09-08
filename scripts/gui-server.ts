// Harbor Eval Kit - local GUI server.
//
// Plain node:http, no framework, binds 127.0.0.1 only. Serves gui/index.html and a
// small JSON API under /api/* that shells out to `harbor`/`podman`. This must run as a
// local process (not a hosted page) because it needs to reach the local Podman/Harbor
// installation -- a hosted sandboxed page cannot.
//
// Run: node scripts/gui-server.ts [--port 4173]

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { discoverProviderModels } from "./lib/provider-probe.ts";
import { readFile } from "node:fs/promises";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { spawn, type ChildProcess } from "node:child_process";
import { registerExperimentRoutes, isExperimentActive } from "./experiment-routes.ts";
import { createRegistryEntry, updateRegistryEntry, deleteRegistryEntry, RegistryNotFoundError } from "./lib/registry-service.ts";
import { appendExperimentAnalysis, readExperiment } from "./lib/experiment-store.ts";
import { redactOutput } from "./lib/experiment-runner.ts";
import { freezeAnalysisInputs } from "./lib/analysis-inputs.ts";
import {
  type CriterionEntry,
  type JudgeEntry,
  type ModelEntry,
  type RegistryName,
  type RubricEntry,
  FREE_AGENTS,
  HARBOR_AGENTS,
  JUDGE_MODELS,
  PROVIDERS,
  buildHarborEnv,
  deleteSecret,
  execCommand,
  execHarbor,
  getStateDir,
  isHarborAvailable,
  getTaskRubricDefault,
  isJudgeModelAllowed,
  listSecretNames,
  listTasks,
  loadSecretsEnv,
  newId,
  resolveAnalysisJson,
  parseResult,
  readRegistry,
  readTaskFiles,
  exportConfigBundle,
  importConfigBundle,
  checkRequestOrigin,
  isTestedHarborVersion,
  TESTED_HARBOR_VERSION,
  getLitellmGatewayConfig,
  getLitellmGatewayPath,
  safeJoinUnderDir,
  listJobLogFiles,
  listJobLogs,
  tailJobLog,
  resolveJudgePromptPath,
  resolvePodmanDockerHost,
  resolveRubricCriteria,
  resolveRubricPath,
  setTaskRubricDefault,
  saveSecret,
  testProviderKey,
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
  const body = redactOutput(JSON.stringify(data), loadSecretsEnv());
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let data = "";
    let bytes = 0;
    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > 10_000_000) { reject(new Error("request body excede 10 MB")); req.resume(); return; }
      data += chunk;
    });
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
  addRoute("GET", `/api/${name}`, (_req, res) => sendJson(res, 200, readRegistry(name)));
  addRoute("POST", `/api/${name}`, (_req, res, _params, body) => sendJson(res, 201, createRegistryEntry(name, body)));
  addRoute("PUT", `/api/${name}/:id`, (_req, res, params, body) => sendJson(res, 200, updateRegistryEntry(name, params.id, body)));
  addRoute("DELETE", `/api/${name}/:id`, (_req, res, params) => { deleteRegistryEntry(name, params.id); sendJson(res, 200, { ok: true }); });
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
// 42 adapter names (and to surface which ones can drive an arbitrary provider's model).
addRoute("GET", "/api/harbor-agents", (_req, res) => {
  sendJson(res, 200, { agents: HARBOR_AGENTS, freeAgents: FREE_AGENTS });
});

// ---------- config bundle (export/import, so a team can version its eval setup in git) ----------

addRoute("GET", "/api/config/export", (_req, res) => {
  sendJson(res, 200, exportConfigBundle());
});

addRoute("POST", "/api/config/import", (_req, res, _params, body) => {
  sendJson(res, 200, importConfigBundle(body));
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
  const result = await testProviderKey(provider.id, name, body.model);
  sendJson(res, result.ok ? 200 : 502, result);
});

// ---------- status / doctor ----------

addRoute("GET", "/api/providers/:provider/models", async (req, res, params) => {
  const provider = PROVIDERS.find(p => p.id === params.provider);
  if (!provider?.envKey) throw new Error("Provider sem credencial simples para descoberta");
  const requested = new URL(req.url!, "http://localhost").searchParams.get("envKey");
  if (requested && requested !== provider.envKey) throw new Error("Credencial não corresponde ao provider escolhido");
  const result = await discoverProviderModels(provider.id, provider.envKey);
  sendJson(res, result.ok ? 200 : 502, result);
});

addRoute("GET", "/api/status", async (_req, res) => {
  const harborAvailable = isHarborAvailable();
  const [harborVersion, podmanVersion, podmanInfo] = await Promise.all([
    harborAvailable ? execHarbor(["--version"]) : Promise.resolve(null),
    execCommand("podman", ["--version"], { dockerHostFix: false }),
    execCommand("podman", ["info"], { dockerHostFix: false }),
  ]);
  const installedHarbor = harborVersion?.stdout.trim() ?? null;
  sendJson(res, 200, {
    harbor: {
      available: harborAvailable,
      version: installedHarbor,
      // Reported, not enforced: a different Harbor usually still runs, it just stops being the
      // one this kit's parsing/argv assumptions were validated against (see
      // TESTED_HARBOR_VERSION for the exact list of what is version-coupled).
      testedVersion: TESTED_HARBOR_VERSION,
      versionMatchesTested: isTestedHarborVersion(installedHarbor),
    },
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
      return { enabled: cfg.enabled, baseUrl: cfg.enabled ? cfg.hostBaseUrl ?? cfg.containerBaseUrl : null, configPath: getLitellmGatewayPath() };
    })(),
  });
});

// Compare, estimate, cancellation and reopen use the shared experiment domain.
registerExperimentRoutes(addRoute, sendJson);

// ---------- job history ----------

addRoute("GET", "/api/jobs", (req, res) => {
  const url = new URL(req.url ?? "", "http://localhost");
  const dir = url.searchParams.get("dir") || "jobs";
  if (!existsSync(dir)) return sendJson(res, 200, []);
  const rows = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => ({ jobName: e.name, ...parseResult(join(dir, e.name)) }));
  sendJson(res, 200, rows);
});

// ---------- tasks ----------

addRoute("POST", "/api/tasks/init", async (_req, res, _params, body) => {
  const { name, org, outputDir, description, author, noPytest, noSolution, steps } = body;
  if (!name) return sendJson(res, 400, { ok: false, error: "name is required (org/name format)" });
  // Found by testing: without --org, `harbor init --task` prompts interactively for
  // "Organization: " on stdin whenever `name` has no "org/" prefix of its own -- the spawned
  // process then has no way to answer, so every such call used to hang for the full 60s
  // timeout and surface as an opaque "Internal Server Error". Reject fast with a clear message
  // instead of ever letting that prompt happen (stdin is also closed in exec.ts as a second,
  // independent layer, in case some other harbor subcommand prompts for something else).
  if (!org && !String(name).includes("/")) {
    return sendJson(res, 400, {
      ok: false,
      error: "org is required when name has no 'org/' prefix (harbor init --task would otherwise prompt interactively and hang)",
    });
  }
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
  let { path: trialPath } = body;
  const { rubricId, judgeId, judgeModel, agent } = body;
  if (body.analysisBatchId && (!Number.isSafeInteger(body.analysisBatchSize) || body.analysisBatchSize < 1 || !Number.isSafeInteger(body.analysisBatchIndex) || body.analysisBatchIndex < 0 || body.analysisBatchIndex >= body.analysisBatchSize)) throw new Error("lote de análise inválido");
  const analysisJobsDir = String(body.jobsDir || "jobs");
  if (body.experimentId) {
    const record = readExperiment(analysisJobsDir, String(body.experimentId));
    if (record.status === "running" || isExperimentActive(record.plan.id) || record.plan.dryRun) throw new Error("aguarde o término de uma execução real antes de analisar");
    if (!record.plan.candidates.some(c => c.jobName === body.jobName)) throw new Error("job não pertence ao experimento");
    trialPath = join(record.plan.jobsDir, body.jobName);
  }
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

  // The curated-model gate is an operational policy, not proof of judge accuracy.
  // `validationMode` is a deliberate, per-call escape hatch for smoke-
  // testing that the analyze pipeline itself works without paying for a high-tier model -- it
  // never silently relaxes the gate: the caller has to ask for it, and every response and
  // report from such a call is stamped validationMode:true so its verdict can't be mistaken
  // for a real evaluation.
  const validationMode = body.validationMode === true;
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
  const inputs = freezeAnalysisInputs(args);
  const result = await execHarbor(inputs.args, { extraEnv: secretsEnv, timeoutMs: 120_000 });
  const response = {
    ok: result.code === 0,
    stdout: redactOutput(result.stdout, secretsEnv),
    stderr: redactOutput(result.stderr, secretsEnv),
    judgeModel: resolvedModel,
    validationMode,
    analysis: result.code === 0 ? resolveAnalysisJson(String(trialPath), result.stdout) : null,
  };
  if (body.experimentId) appendExperimentAnalysis(analysisJobsDir, String(body.experimentId), body.jobName, {
    ...JSON.parse(redactOutput(JSON.stringify(response), secretsEnv)), createdAt: new Date().toISOString(), judgeId, rubricId, analysisBatchId: body.analysisBatchId, analysisBatchSize: body.analysisBatchSize, analysisBatchIndex: body.analysisBatchIndex,
    // Exact prompt/rubric used at invocation, not mutable registry references alone.
    rubric: inputs.rubric,
    prompt: inputs.prompt,
  });
  sendJson(res, result.code === 0 ? 200 : 500, response);
});

// ---------- static + dispatch ----------

async function serveIndex(res: ServerResponse): Promise<void> {
  const html = await readFile(GUI_HTML_PATH, "utf-8");
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

const GUI_DIR = join(import.meta.dirname, "..", "gui");
const STATIC_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

/**
 * Serves the GUI's own stylesheet and ES modules. The URL path is joined under gui/ through
 * safeJoinUnderDir, so a crafted "../../.harbor-eval-kit/secrets.env" can never escape the
 * directory -- this server is the same process that holds the secrets, so an unguarded static
 * handler would be the most direct way to leak them. Only the extensions above are served at
 * all; anything else 404s rather than being handed over with a guessed content type.
 */
async function serveStatic(pathname: string, res: ServerResponse): Promise<boolean> {
  const ext = pathname.slice(pathname.lastIndexOf("."));
  if (!STATIC_TYPES[ext]) return false;
  const target = safeJoinUnderDir(GUI_DIR, pathname.replace(/^\/+/, ""));
  if (!target || !existsSync(target)) return false;
  const body = await readFile(target, "utf-8");
  res.writeHead(200, { "Content-Type": STATIC_TYPES[ext], "Cache-Control": "no-cache" });
  res.end(body);
  return true;
}

/** Port this process is listening on -- the origin guard needs it to tell this server's own
 *  page apart from anything else pointing at loopback. Set once in main(). */
let listeningPort = 4173;

async function dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    // Before routing anything: 127.0.0.1 keeps the network out, this keeps the user's own
    // browser out. See scripts/lib/httpguard.ts for the two attacks it stops.
    const guard = checkRequestOrigin(
      { host: req.headers.host, origin: req.headers.origin as string | undefined },
      listeningPort
    );
    if (!guard.allowed) return sendJson(res, 403, { ok: false, error: guard.reason });

    const url = new URL(req.url ?? "/", "http://localhost");
    const pathname = url.pathname;

    if (req.method === "GET" && pathname === "/") {
      await serveIndex(res);
      return;
    }

    if (req.method === "GET" && (await serveStatic(pathname, res))) return;

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
    const error = err as Error & { statusCode?: number; estimate?: unknown; needsAcknowledge?: boolean };
    sendJson(res, error.statusCode ?? (err instanceof RegistryNotFoundError ? 404 : 400), { ok: false, error: error.message ?? String(err), estimate: error.estimate, needsAcknowledge: error.needsAcknowledge });
  }
}

function main(): void {
  const { values } = parseArgs({ options: { port: { type: "string", default: "4173" } } });
  const port = parseInt(values.port ?? "4173", 10);
  listeningPort = port;

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
