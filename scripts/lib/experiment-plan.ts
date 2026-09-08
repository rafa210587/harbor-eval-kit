// One effective plan for HTTP, CLI, cost preview and execution. No subprocesses or writes.
import { existsSync, readdirSync, lstatSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import { randomUUID } from "node:crypto";
import type { AgentEntry, Combo, ModelEntry, SkillEntry, SkillsetEntry } from "./types.ts";
import { sanitize, jobName, MAX_JOB_NAME_LENGTH } from "./naming.ts";
import { estimateCompareCost, checkCostGuard } from "./cost.ts";
import { assertSafeId } from "./registry-validation.ts";

export interface Candidate extends Combo {
  integrationId?: string;
  id: string;
  label: string;
  profileId?: string;
  skills: SkillEntry[];
  jobName: string;
}
export interface ExperimentPlan {
  version: 1;
  id: string;
  createdAt: string;
  taskPath: string;
  tasks: string[];
  jobsDir: string;
  nAttempts: number;
  concurrency: number;
  dryRun: boolean;
  env: string;
  extra: string[];
  title?: string;
  description?: string;
  baselineIndex?: number;
  candidates: Candidate[];
}
export const MAX_JOB_PATH_LENGTH = 240;
export function positiveInteger(raw: unknown, name: string): number {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} deve ser inteiro positivo`);
  return value;
}

// The kit supports a local task or a directory of immediate task children, matching Harbor's
// DatasetConfig._get_local_tasks. Reject ambiguity rather than silently undercounting trials.
export function discoverExperimentTasks(input: string): string[] {
  const dir = resolve(input);
  if (!existsSync(dir) || !lstatSync(dir).isDirectory() || lstatSync(dir).isSymbolicLink()) throw new Error("task/dataset path deve ser um diretório local existente, sem link");
  if (existsSync(join(dir, "task.toml"))) return [dir];
  const entries = readdirSync(dir, { withFileTypes: true });
  if (entries.some(e => e.isSymbolicLink())) throw new Error("dataset com link simbólico: exporte tasks como diretórios regulares");
  const tasks = entries.filter(e => e.isDirectory() && existsSync(join(dir, e.name, "task.toml"))).map(e => join(dir, e.name)).sort();
  if (!tasks.length) throw new Error("dataset sem tasks imediatas contendo task.toml");
  return tasks;
}

function rejectEmbeddedCredentials(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (/(?:api.?key|secret|password|credential|authorization|access.?token|auth.?token|bearer)/i.test(key)) {
      throw new Error("credencial em configuração estruturada; use Credenciais, nunca argumentos extras");
    }
    rejectEmbeddedCredentials(nested);
  }
}

/** Deliberately narrow extension surface: other flags can override task/model/attempts or
 * introduce retries/config files behind the guard. Quoted values support spaces/Windows paths. */
export function parseExperimentExtra(raw: unknown): string[] {
  const text = String(raw ?? "");
  const tokens: string[] = [];
  let token = "", quote = "";
  for (const char of text) {
    if (quote) { if (char === quote) quote = ""; else token += char; }
    else if (char === '"' || char === "'") quote = char;
    else if (/\s/.test(char)) { if (token) { tokens.push(token); token = ""; } }
    else token += char;
  }
  if (quote) throw new Error("aspas não fechadas nos argumentos extras");
  if (token) tokens.push(token);
  const allowed = new Set(["--timeout-multiplier", "--ak", "--agent-kwarg"]);
  for (let i = 0; i < tokens.length; i++) {
    const [flag, ...inline] = tokens[i].split("=");
    if (!allowed.has(flag)) throw new Error(`argumento extra não permitido pelo plano: ${flag}`);
    const value = inline.length ? inline.join("=") : tokens[++i];
    if (!value || value.startsWith("-")) throw new Error(`valor ausente para ${flag}`);
    if (flag === "--timeout-multiplier" && (!Number.isFinite(Number(value)) || Number(value) <= 0)) throw new Error("timeout-multiplier inválido");
    if (flag !== "--timeout-multiplier") {
      const key = value.split("=")[0];
      if (!value.includes("=") || (key !== "max_tokens" && /(?:api.?key|secret|token|password|credential)/i.test(key))) throw new Error("kwarg inválido ou reservado a credenciais; use Secrets");
      if (key === "max_tokens") positiveInteger(value.slice(key.length + 1), "max_tokens");
      const nested = value.slice(key.length + 1).trim();
      if (/^[{\[]/.test(nested)) {
        let parsed: unknown;
        try { parsed = JSON.parse(nested); } catch { throw new Error("configuração estruturada nos kwargs deve ser JSON válido"); }
        rejectEmbeddedCredentials(parsed);
      }
    }
  }
  return tokens;
}

export function resolveRegisteredCandidates(entries: unknown, registries: { agents: AgentEntry[]; models: ModelEntry[]; skills: SkillEntry[]; skillsets: SkillsetEntry[] }): Omit<Candidate, "id" | "jobName">[] {
  if (!Array.isArray(entries) || !entries.length) throw new Error("adicione ao menos uma entrada");
  return entries.map(entry => {
    const agent = registries.agents.find(a => a.id === entry?.agentId);
    if (!agent) throw new Error("agentId inexistente");
    // Omission uses profile defaults; explicit empty string selects Harbor's default.
    const modelId = entry.modelId === undefined ? agent.modelId : entry.modelId;
    const model = modelId ? registries.models.find(m => m.id === modelId) : null;
    if (modelId && !model) throw new Error("modelId inexistente");
    const ids = entry.skillsetIds === undefined ? agent.defaultSkillsetIds ?? [] : entry.skillsetIds;
    if (!Array.isArray(ids)) throw new Error("skillsetIds deve ser lista");
    const sets = ids.map(id => {
      const found = registries.skillsets.find(s => s.id === id);
      if (!found) throw new Error("skillsetId inexistente");
      return found;
    });
    const skillIds = [...new Set(sets.flatMap(s => s.skillIds))];
    const skills = skillIds.map(id => {
      const skill = registries.skills.find(s => s.id === id);
      if (!skill) throw new Error("skillId inexistente");
      return skill;
    });
    if (agent.instructions?.trim()) skills.unshift({ id: `agent-${agent.id}`, label: "instruções do perfil", mode: "authored", instructions: agent.instructions });
    return { agent: agent.agentValue, model: model?.value ?? null, label: agent.label, profileId: agent.id,
      ...(agent.integrationId ? { integrationId: agent.integrationId } : {}),
      skillset: { label: sets.length ? sanitize(sets.map(s => s.label).join("+")) : "none", paths: [] }, skills };
  });
}

export function cliCandidates(combos: Combo[]): Omit<Candidate, "id" | "jobName">[] {
  return combos.map(combo => ({ ...combo, label: combo.agent, skills: combo.skillset.paths.map((path, i) => ({ id: `path-${i}`, label: basename(path), mode: "path", path: resolve(path) })) }));
}

export function createExperimentPlan(input: { path: string; jobsDir?: string; jobPrefix?: string; runId?: string; nAttempts?: unknown; concurrency?: unknown; dryRun?: boolean; env?: string; extra?: unknown; title?: unknown; description?: unknown; baselineIndex?: unknown }, candidates: Omit<Candidate, "id" | "jobName">[]): ExperimentPlan {
  if (!input.path || typeof input.path !== "string" || !candidates.length) throw new Error("path e candidatos são obrigatórios");
  const id = input.runId ?? randomUUID();
  assertSafeId(id);
  for (const [field, limit] of [["title", 120], ["description", 1000]] as const) {
    if (input[field] !== undefined && (typeof input[field] !== "string" || input[field].length > limit)) throw new Error(`${field} deve ser texto com até ${limit} caracteres`);
  }
  if (input.baselineIndex !== undefined && (!Number.isInteger(input.baselineIndex) || Number(input.baselineIndex) < 0 || Number(input.baselineIndex) >= candidates.length)) throw new Error("baselineIndex deve identificar um candidato da comparação");
  if (input.env && input.env !== "docker") throw new Error("este kit usa apenas o backend docker do Harbor conectado ao Podman");
  const prefix = sanitize(input.jobPrefix ?? "cmp").slice(0, 16);
  const plan: ExperimentPlan = { version: 1, id, createdAt: new Date().toISOString(), taskPath: resolve(input.path), tasks: discoverExperimentTasks(input.path), jobsDir: resolve(input.jobsDir ?? "jobs"),
    nAttempts: positiveInteger(input.nAttempts ?? 1, "n-attempts"), concurrency: positiveInteger(input.concurrency ?? 1, "concurrency"), dryRun: input.dryRun === true, env: "docker", extra: parseExperimentExtra(input.extra),
    candidates: candidates.map((c, i) => ({ ...c, id: `candidate-${i + 1}`, jobName: jobName(prefix, { ...c, skillset: { ...c.skillset, label: sanitize(c.skillset.label).slice(0, 32) } }, { runId: id, candidateIndex: i + 1 }) })) };
  const longestTask = plan.tasks.reduce((longest, task) => basename(task).length > basename(longest).length ? task : longest, plan.tasks[0]);
  for (const candidate of plan.candidates) {
    if (candidate.jobName.length > MAX_JOB_NAME_LENGTH) throw new Error(`nome de job excede ${MAX_JOB_NAME_LENGTH} caracteres; encurte o prefixo`);
    const jobPath = join(plan.jobsDir, candidate.jobName);
    if (jobPath.length > MAX_JOB_PATH_LENGTH) {
      throw new Error(`caminho do job excede ${MAX_JOB_PATH_LENGTH} caracteres; encurte jobs-dir antes de iniciar trials`);
    }
    const trialArtifactPath = join(plan.jobsDir, candidate.jobName, `${basename(longestTask)}__XXXXXXX`, "artifacts", "logs", "artifacts");
    if (trialArtifactPath.length > MAX_JOB_PATH_LENGTH) {
      throw new Error(`caminho de trial/artefatos excede ${MAX_JOB_PATH_LENGTH} caracteres; encurte jobs-dir ou task antes de iniciar trials`);
    }
  }
  const experimentPath = join(plan.jobsDir, ".experiments", plan.id, "experiment.json");
  if (experimentPath.length > MAX_JOB_PATH_LENGTH) {
    throw new Error(`caminho do experimento excede ${MAX_JOB_PATH_LENGTH} caracteres; encurte jobs-dir antes de iniciar trials`);
  }
  if (!Number.isSafeInteger(plan.tasks.length * plan.nAttempts * candidates.length)) throw new Error("volume de trials excede inteiro seguro");
  plan.title = (input.title as string | undefined)?.trim() || undefined;
  plan.description = (input.description as string | undefined)?.trim() || undefined;
  plan.baselineIndex = input.baselineIndex as number | undefined;
  return plan;
}

export function estimateExperiment(plan: ExperimentPlan) {
  return estimateCompareCost(plan.jobsDir, plan.candidates.map(c => ({ agent: c.agent, model: c.model ?? "(default)" })), plan.nAttempts, plan.tasks.length);
}
export function guardExperiment(plan: ExperimentPlan, cap: unknown, acknowledged: unknown) {
  const capUsd = cap === undefined || cap === null || cap === "" ? null : Number(cap);
  if (capUsd !== null && (!Number.isFinite(capUsd) || capUsd < 0)) throw new Error("teto de gasto deve ser número não negativo");
  const estimate = estimateExperiment(plan);
  return plan.dryRun ? { allowed: true, reason: null, estimate } : checkCostGuard(estimate, capUsd, acknowledged === true);
}
