// Tasks on disk: reading/writing the four files a Harbor task is made of, discovering tasks
// under evals/ and datasets/, and the per-task Judge/rubric pin. The pin lives in the state
// dir keyed by task path -- it is a preference of this kit on this machine, not part of the
// task's own Harbor-defined content.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { managedPath, newId } from "./paths.ts";
import { assertSafeId } from "./registry-validation.ts";

// live inside the repo (e.g. evals/python/my-task), not the kit's local state dir --
// it's the kind of thing you'd commit to git and share with a team. These helpers let the
// GUI read/write the handful of human-authored files without the user opening an editor.

export interface TaskFiles {
  instruction: string;
  dockerfile: string;
  solveSh: string;
  testSh: string;
}

const TASK_FILE_MAP: Record<keyof TaskFiles, string> = {
  instruction: "instruction.md",
  dockerfile: join("environment", "Dockerfile"),
  solveSh: join("solution", "solve.sh"),
  testSh: join("tests", "test.sh"),
};

export function readTaskFiles(taskDir: string): TaskFiles {
  const read = (rel: string): string => {
    const p = join(taskDir, rel);
    return existsSync(p) ? readFileSync(p, "utf-8") : "";
  };
  return {
    instruction: read(TASK_FILE_MAP.instruction),
    dockerfile: read(TASK_FILE_MAP.dockerfile),
    solveSh: read(TASK_FILE_MAP.solveSh),
    testSh: read(TASK_FILE_MAP.testSh),
  };
}

export function writeTaskFiles(taskDir: string, files: Partial<TaskFiles>): void {
  for (const key of Object.keys(files) as (keyof TaskFiles)[]) {
    const content = files[key];
    if (content === undefined) continue;
    const full = join(taskDir, TASK_FILE_MAP[key]);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, "utf-8");
  }
}

export function isTaskStub(taskDir: string): boolean {
  const tomlPath = join(taskDir, "task.toml");
  if (!existsSync(tomlPath)) return true;
  return !readFileSync(tomlPath, "utf-8").includes("[task]");
}

export interface TaskListing {
  path: string;
  stub: boolean;
  /** "evals" = hand-authored by you; "datasets" = downloaded via `harbor dataset download`. */
  source: "evals" | "datasets";
}

function scanTaskTree(baseDir: string, source: TaskListing["source"]): TaskListing[] {
  const out: TaskListing[] = [];
  if (!existsSync(baseDir)) return out;
  for (const group of readdirSync(baseDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const groupDir = join(baseDir, group.name);
    for (const task of readdirSync(groupDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
      const dir = join(groupDir, task.name);
      out.push({ path: dir, stub: isTaskStub(dir), source });
    }
  }
  return out;
}

/**
 * Tasks live in two places: `evals/<lang>/<name>` (hand-authored, the kit's own convention)
 * and `datasets/<dataset>/<name>` (the layout `harbor dataset download` produces in export
 * mode). Both are structurally identical task directories -- surfacing them together is what
 * lets a downloaded dataset's tasks show up in the same picker as your own without a separate
 * "datasets" concept in the Compare flow.
 */
export function listTasks(): TaskListing[] {
  return [...scanTaskTree("evals", "evals"), ...scanTaskTree("datasets", "datasets")];
}

// ---------- Task <-> Judge Rubric pinning ----------
// A rubric's relevance is a property of the task/domain being evaluated (a Python-quality
// rubric only makes sense for Python tasks), not of one particular Compare run -- so the
// default is stored per task path, not per comparison session. Kept in the state dir (like
// registries/secrets) rather than inside the task folder itself: it's a preference of this
// kit on this machine, not part of the task's own Harbor-defined content.

export interface TaskRubricDefault {
  /** N rubrics, not just one -- harbor analyze --rubric still takes one path per call, so
   *  multiple pinned rubrics mean multiple analyze calls (one per rubric), orchestrated by
   *  the caller, same pattern as Compare running one harbor run per entry. */
  rubricIds?: string[];
  /** Judges registry id (bundles agent + model + optional prompt template). */
  judgeId?: string;
}

function getTaskRubricDefaultsPath(): string {
  return managedPath("task-rubric-defaults.json");
}

function readTaskRubricDefaults(): Record<string, TaskRubricDefault> {
  const p = getTaskRubricDefaultsPath();
  if (!existsSync(p)) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(p, "utf-8")); }
  catch { throw new Error("defaults de task corrompidos; restaure o JSON antes de salvar, arquivo preservado"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("defaults de task devem ser um objeto JSON");
  return parsed as Record<string, TaskRubricDefault>;
}

export function getTaskRubricDefault(taskPath: string): TaskRubricDefault {
  const all = readTaskRubricDefaults();
  return Object.hasOwn(all, taskPath) ? all[taskPath] : {};
}

export function setTaskRubricDefault(taskPath: string, value: TaskRubricDefault): void {
  if (typeof taskPath !== "string" || !taskPath.trim()) throw new Error("path da task obrigatório");
  if (value.judgeId) assertSafeId(value.judgeId);
  if (value.rubricIds !== undefined) {
    if (!Array.isArray(value.rubricIds)) throw new Error("rubricIds deve ser lista");
    value.rubricIds.forEach(assertSafeId);
  }
  const all = readTaskRubricDefaults();
  if ((!value.rubricIds || value.rubricIds.length === 0) && !value.judgeId) {
    delete all[taskPath];
  } else {
    Object.defineProperty(all, taskPath, { value, writable: true, enumerable: true, configurable: true });
  }
  const p = getTaskRubricDefaultsPath();
  mkdirSync(dirname(p), { recursive: true });
  const temp = `${p}.${newId()}.tmp`;
  writeFileSync(temp, JSON.stringify(all, null, 2), { flag: "wx" });
  renameSync(temp, p);
}
