// Durable experiment artifacts. Inputs are copied once; editing a registry cannot change a run.
import { mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, existsSync, lstatSync, chmodSync } from "node:fs";
import { join, dirname, basename, relative, resolve, isAbsolute } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { ExperimentPlan } from "./experiment-plan.ts";
import type { ResultRow } from "./types.ts";
import { assertSafeId, validateRegistryEntry } from "./registry-validation.ts";
import { assertNoSymlinkPath, safeJoinUnderDir } from "./paths.ts";
import { TESTED_HARBOR_VERSION } from "./catalog.ts";
import { parseResult, summarizeAnalysisRecords, writeReport } from "./results.ts";

export interface InputHash { path: string; sha256: string }
export interface ExperimentRecord {
  plan: ExperimentPlan;
  status: "prepared" | "running" | "finished" | "cancelled" | "failed";
  nodeVersion: string;
  testedHarborVersion: string;
  harborVersion?: string;
  inputs: InputHash[];
  rows: ResultRow[];
  analyses: Record<string, any[]>;
  finishedAt?: string;
  error?: string;
}
export function experimentDirectory(jobsDir: string, id: string): string {
  assertSafeId(id);
  const dir = resolve(jobsDir, ".experiments", id);
  assertNoSymlinkPath(dir, resolve(jobsDir));
  return dir;
}
export function writeExperiment(record: ExperimentRecord): void {
  const path = join(experimentDirectory(record.plan.jobsDir, record.plan.id), "experiment.json");
  const tmp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(tmp, JSON.stringify(record, null, 2), { flag: "wx" });
  renameSync(tmp, path);
}

function snapshotTree(source: string, target: string, root: string, hashes: InputHash[]): void {
  assertNoSymlinkPath(source, source);
  const rel = relative(resolve(source), resolve(target));
  if (!rel || (!rel.startsWith("..") && !isAbsolute(rel))) throw new Error("snapshot não pode ficar dentro de sua própria entrada");
  if (!lstatSync(source).isDirectory()) throw new Error("entrada do snapshot deve ser diretório");
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
    // Do not silently omit content: a benchmark depending on Git history would change meaning.
    if (entry.name === ".git") throw new Error("snapshot não aceita .git; use uma task/skill exportada sem metadados do Git");
    if (/^(?:secrets\.env|\.env(?:\..*)?|credentials\.json)$|\.(?:pem|pfx|p12)$/i.test(entry.name)) throw new Error("snapshot recusado: remova arquivos de credenciais da task/skill");
    const from = join(source, entry.name), to = join(target, entry.name);
    if (entry.isSymbolicLink()) throw new Error("snapshot não aceita links simbólicos/junctions; use arquivos regulares");
    if (entry.isDirectory()) snapshotTree(from, to, root, hashes);
    else if (entry.isFile()) { saveInput(to, readFileSync(from), root, hashes); chmodSync(to, lstatSync(from).mode & 0o777); }
    else throw new Error("snapshot contém arquivo especial não suportado");
  }
}
function saveInput(path: string, content: string | Buffer, root: string, hashes: InputHash[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, { flag: "wx" });
  hashes.push({ path: relative(root, path).split("\\").join("/"), sha256: createHash("sha256").update(content).digest("hex") });
}

export function prepareExperiment(original: ExperimentPlan): ExperimentRecord {
  const plan: ExperimentPlan = structuredClone(original);
  const root = experimentDirectory(plan.jobsDir, plan.id);
  mkdirSync(dirname(root), { recursive: true });
  mkdirSync(root); // exclusive reservation: an existing id is never silently reused
  const record: ExperimentRecord = { plan, status: "prepared", nodeVersion: process.version, testedHarborVersion: TESTED_HARBOR_VERSION, inputs: [], rows: [], analyses: {} };
  try {
    const single = plan.tasks.length === 1 && plan.taskPath === plan.tasks[0];
    const taskRoot = join(root, "inputs", "tasks");
    for (const task of plan.tasks) snapshotTree(task, join(taskRoot, basename(task)), root, record.inputs);
    plan.taskPath = single ? join(taskRoot, basename(plan.tasks[0])) : taskRoot;
    for (const candidate of plan.candidates) {
      candidate.skillset.paths = [];
      const names = new Set<string>();
      for (const skill of candidate.skills) {
        validateRegistryEntry("skills", skill);
        const name = skill.mode === "path" ? basename(resolve(skill.path!)) : `skill-${skill.id}`;
        if (names.has(name.toLowerCase())) throw new Error("skills com o mesmo nome de diretório; renomeie uma antes de comparar");
        names.add(name.toLowerCase());
        const target = join(root, "inputs", candidate.id, "skills", name);
        if (skill.mode === "path") {
          if (!existsSync(join(skill.path!, "SKILL.md"))) throw new Error("skill sem SKILL.md");
          snapshotTree(resolve(skill.path!), target, root, record.inputs);
        } else {
          saveInput(join(target, "SKILL.md"), skill.instructions ?? "", root, record.inputs);
          for (const file of skill.extraFiles ?? []) {
            const path = safeJoinUnderDir(target, file.name);
            if (!path) throw new Error("arquivo extra fora da skill");
            saveInput(path, file.content, root, record.inputs);
          }
        }
        candidate.skillset.paths.push(target);
      }
    }
    writeExperiment(record);
    return record;
  } catch (error) {
    record.status = "failed";
    record.error = "preparação de snapshot falhou; nenhum trial iniciado";
    writeExperiment(record);
    throw error;
  }
}

export function readExperiment(jobsDir: string, id: string): ExperimentRecord {
  const record = JSON.parse(readFileSync(join(experimentDirectory(jobsDir, id), "experiment.json"), "utf8")) as ExperimentRecord;
  if (record.plan?.version !== 1 || record.plan.id !== id || resolve(record.plan.jobsDir) !== resolve(jobsDir)) throw new Error("registro de experimento inválido");
  // Results from disk can progress even when the GUI is restarted. Never overwrite cancellation
  // with Harbor's stale finished_at:null after an interrupted child process.
  if (record.status === "running") {
    record.rows = record.plan.candidates.map(candidate => {
      const saved = record.rows.find(r => r.jobName === candidate.jobName);
      const path = join(jobsDir, candidate.jobName, "result.json");
      if (!existsSync(path)) return saved;
      try {
        const data = JSON.parse(readFileSync(path, "utf8"));
        if (!data.finished_at) return saved;
        const parsed = parseResult(join(jobsDir, candidate.jobName));
        return { jobName: candidate.jobName, agent: candidate.label, model: candidate.model ?? "(default)", skillset: candidate.skillset.label, ok: !parsed.error && parsed.nErrors === 0, ...parsed };
      } catch { return saved; }
    }).filter((r): r is ResultRow => !!r);
    if (record.rows.length === record.plan.candidates.length) record.status = record.rows.some(r => !r.ok) ? "failed" : "finished";
  }
  return record;
}

export function listExperiments(jobsDir: string) {
  const root = join(resolve(jobsDir), ".experiments");
  assertNoSymlinkPath(root, resolve(jobsDir));
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => {
    try {
      const r = readExperiment(jobsDir, e.name);
      return { id: r.plan.id, createdAt: r.plan.createdAt, status: r.status, nCandidates: r.plan.candidates.length, title: r.plan.title, taskPath: r.plan.tasks.length === 1 ? r.plan.tasks[0] : r.plan.taskPath, nTasks: r.plan.tasks.length, baselineIndex: r.plan.baselineIndex };
    } catch { return { id: e.name, status: "unreadable", createdAt: "", nCandidates: 0 }; }
  }).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
}

export function appendExperimentAnalysis(jobsDir: string, id: string, jobName: string, analysis: any, secrets?: Record<string, string>): void {
  const record = readExperiment(jobsDir, id);
  if (!record.plan.candidates.some(c => c.jobName === jobName)) throw new Error("job não pertence ao experimento");
  (record.analyses[jobName] ??= []).push(analysis);
  const row = record.rows.find(r => r.jobName === jobName);
  if (row) Object.assign(row, summarizeAnalysisRecords(record.analyses[jobName]));
  writeExperiment(record);
  writeReport(record.rows, join(experimentDirectory(jobsDir, id), "report"), secrets);
}
