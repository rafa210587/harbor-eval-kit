// Harbor Eval Kit - shared helpers for compare-matrix.ts and gui-server.ts.
// Node built-ins only (no external dependencies), imported with explicit .ts
// extensions as required by Node's native type-stripping module resolution.

import { spawn, execFileSync } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  statSync,
  openSync,
  readSync,
  closeSync,
} from "node:fs";
import { join, basename, dirname, relative, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";

// ---------- Types ----------

export interface Skillset {
  label: string;
  paths: string[];
}

export interface Combo {
  agent: string;
  model: string | null;
  skillset: Skillset;
}

export interface ResultRow {
  jobName: string;
  agent: string;
  model: string;
  skillset: string;
  ok: boolean;
  nTrials?: number;
  nErrors?: number;
  meanReward?: number;
  durationSec?: number;
  /** Total cost (USD) Harbor itself billed the solving agent for this job (all trials summed),
   *  read straight from `stats.cost_usd` in the job's result.json -- not an estimate this kit
   *  computes, the same number `harbor`'s own job stats report. */
  costUsd?: number;
  nInputTokens?: number;
  nOutputTokens?: number;
  error?: string;
}

interface HarborResultJson {
  stats?: {
    n_completed_trials?: number;
    n_errored_trials?: number;
    evals?: Record<
      string,
      { n_trials?: number; n_errors?: number; metrics?: { mean?: number }[] }
    >;
    n_input_tokens?: number;
    n_cache_tokens?: number;
    n_output_tokens?: number;
    cost_usd?: number;
  };
}

export interface ExecOptions {
  /** Mirror stdout/stderr to this process's own streams as they arrive. */
  echo?: boolean;
  /** Inject the Podman-forwarded DOCKER_HOST for this child only (default: true on win32). */
  dockerHostFix?: boolean;
  extraEnv?: Record<string, string>;
  cwd?: string;
  /** Kill the child if it hasn't exited after this many ms (default: no timeout). */
  timeoutMs?: number;
}

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
  durationSec: number;
}

export interface AgentEntry {
  id: string;
  label: string;
  agentValue: string;
  /** Models registry id. Used when a compare run doesn't sweep/override the model. */
  modelId?: string;
  /** Free-text instructions always attached to this agent's runs, materialized as a skill. */
  instructions?: string;
  /** Skillsets registry ids always attached to this agent's runs, in addition to any swept skillset. */
  defaultSkillsetIds?: string[];
  notes?: string;
}

export interface ModelEntry {
  id: string;
  label: string;
  value: string;
}

export interface SkillEntry {
  id: string;
  label: string;
  /** "authored": instructions are written to a managed SKILL.md. "path": points at an existing skill dir. */
  mode: "authored" | "path";
  instructions?: string;
  path?: string;
  /** Optional extra files materialized alongside SKILL.md in "authored" mode -- e.g.
   *  examples/foo.py, templates/bar.md, referenced from SKILL.md by relative path. Confirmed
   *  against the installed harbor package (harbor/trial/trial.py `_upload_injected_skills`)
   *  that Harbor uploads the *entire* skill directory into the agent's environment, not just
   *  SKILL.md -- so this isn't a GUI-only convenience, the agent genuinely receives these
   *  files, same as Anthropic's own Agent Skills convention of bundling reference material
   *  alongside a skill's entry-point file. `name` may include `/` for a subdirectory. */
  extraFiles?: { name: string; content: string }[];
}

export interface SkillsetEntry {
  id: string;
  label: string;
  /** References into the Skills registry. */
  skillIds: string[];
}

export interface RubricCriterion {
  name: string;
  description: string;
  guidance: string;
}

/** A single reusable evaluation criterion, referenced by id from one or more Rubrics -- same
 *  relationship as Skill -> Skillset, so e.g. "no_prolixity" is written once and shared across
 *  a Python rubric and a TypeScript rubric instead of being retyped into each. */
export interface CriterionEntry {
  id: string;
  name: string;
  description: string;
  guidance: string;
}

export interface RubricEntry {
  id: string;
  label: string;
  /** References into the Criteria registry. */
  criterionIds: string[];
}

/**
 * A "perfil de juiz", mirroring AgentEntry on the evaluation side: which harbor --agent runs
 * the judge, which (curated, high-tier) model it uses, an optional custom prompt template
 * replacing harbor's own analyze.txt, and which Judge Rubrics are checked by default.
 *
 * NOTE on skills: unlike AgentEntry, this has no `defaultSkillsetIds`-equivalent that attaches
 * real SKILL.md tool-accessible skills to the judge run. Confirmed against the installed
 * harbor package (harbor/analyze/analyzer.py `_run_analyze_job`): it builds an `AgentConfig`
 * without ever setting `.skills`, and `harbor analyze`'s CLI (harbor/cli/analyze.py) has no
 * `--skill`/`--skills` flag at all (unlike `harbor run`, which does). `promptTemplate` is the
 * closest real lever Harbor exposes for shaping how the judge behaves.
 */
export interface JudgeEntry {
  id: string;
  label: string;
  agentValue: string;
  /** Models registry id; must resolve to a value in JUDGE_MODELS. */
  modelId?: string;
  /** Optional custom judge instructions, replacing harbor's own analyze.txt via `--prompt`.
   *  May use the {trial_path}, {task_section}, {criteria_guidance} placeholders that harbor's
   *  analyzer.py fills in with .format_map() -- missing placeholders are left blank, not an error. */
  promptTemplate?: string;
  /** Judge Rubrics registry ids, pre-checked when this Judge is picked in Compare/Task pinning. */
  defaultRubricIds?: string[];
  notes?: string;
}

export type RegistryName = "agents" | "models" | "skills" | "skillsets" | "criteria" | "rubrics" | "judges";

/**
 * Curated, fixed judge-model allowlist for `harbor analyze`. Harbor's own CLI default
 * (claude-haiku-4-5) is a cost-friendly choice, not a considered "good enough to judge
 * trajectories" one -- the whole point of the judge step is to catch what the cheap
 * deterministic test.sh reward missed, so the judge itself should not be a cheap model.
 * Update this list by hand as new high-tier models ship; never accept a judge model that
 * isn't in it (see isJudgeModelAllowed).
 */
export const JUDGE_MODELS: { label: string; value: string }[] = [
  { label: "Claude Opus 5", value: "anthropic/claude-opus-5" },
  { label: "Claude Fable 5.1", value: "anthropic/claude-fable-5-1" },
  { label: "GPT-5.1", value: "openai/gpt-5.1" },
  { label: "Gemini 3 Pro", value: "gemini/gemini-3-pro" },
];

export function isJudgeModelAllowed(value: string): boolean {
  return JUDGE_MODELS.some((m) => m.value === value);
}

// ---------- Sanitizing / naming ----------

export function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "x";
}

export function parseSkillset(raw: string): Skillset {
  const paths = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (paths.length === 0) return { label: "none", paths: [] };
  return { label: paths.map((p) => sanitize(basename(p))).join("+"), paths };
}

export function buildCombos(agents: string[], models: string[], skillsets: Skillset[]): Combo[] {
  const modelList: (string | null)[] = models.length > 0 ? models : [null];
  const combos: Combo[] = [];
  for (const agent of agents) {
    for (const model of modelList) {
      for (const skillset of skillsets) {
        combos.push({ agent, model, skillset });
      }
    }
  }
  return combos;
}

export function jobName(prefix: string, c: Combo): string {
  const parts = [prefix, `agent-${sanitize(c.agent)}`];
  if (c.model) parts.push(`model-${sanitize(c.model)}`);
  parts.push(`skill-${c.skillset.label}`);
  return parts.join("__");
}

export function buildHarborRunArgs(opts: {
  taskPath: string;
  combo: Combo;
  jobsDir: string;
  name: string;
  env: string;
  nAttempts: string;
  extra: string[];
  autoYes: boolean;
  printConfigOnly: boolean;
}): string[] {
  const args = [
    "run",
    "--path",
    opts.taskPath,
    "--agent",
    opts.combo.agent,
    "--env",
    opts.env,
    "--jobs-dir",
    opts.jobsDir,
    "--job-name",
    opts.name,
    "--n-attempts",
    opts.nAttempts,
  ];
  if (opts.combo.model) args.push("--model", opts.combo.model);
  for (const p of opts.combo.skillset.paths) args.push("--skill", p);
  if (opts.autoYes) args.push("-y");
  if (opts.printConfigOnly) args.push("--print-config");
  args.push(...opts.extra);
  return args;
}

// ---------- Process execution ----------

/**
 * On Windows, Docker Desktop's own pipe is the CLI/SDK default context even when it's
 * stopped; the Podman machine forwards its Docker-compatible API to a different, generic
 * pipe. On macOS and Linux the same class of problem can show up differently (no Docker
 * Desktop pipe to collide with, but Harbor's Docker-oriented backend still needs to be
 * pointed at Podman's actual socket rather than assuming the Docker CLI's own default).
 * Scoping DOCKER_HOST to a single spawned child (never process.env globally) routes that one
 * call to Podman without touching the caller's shell or any other tool on the host.
 */
let cachedPodmanDockerHost: string | null | undefined; // undefined = not resolved yet this process

/**
 * Resolves the DOCKER_HOST value that reaches Podman's Docker-compatible API, per platform:
 *
 * - **win32**: a fixed, well-known named pipe (`docker_engine`) that Podman machine exposes
 *   specifically for Docker-CLI/SDK compatibility, distinct from its own per-machine-named
 *   native API pipe (confirmed: `podman machine inspect` reports the native pipe as
 *   `\\.\pipe\podman-machine-default`, a different, machine-name-dependent value) -- this is
 *   the value validated by every real `harbor run` in this kit's own testing, kept hardcoded
 *   rather than "discovered" because there's nothing to discover it from.
 * - **darwin**: Podman on macOS always runs inside a VM ("podman machine"); its Docker-API
 *   socket path is host-local but machine-name-dependent, so it's resolved dynamically via
 *   `podman machine inspect`.
 * - **linux**: rootless Podman normally exposes its API socket directly (no VM/machine layer)
 *   -- `podman info` reports that socket's real path, and unlike the Windows case, the same
 *   socket already speaks the Docker-compatible dialect (Podman's API server multiplexes
 *   both under one socket on Unix). If a Podman *machine* is active instead (uncommon on
 *   Linux, but supported), the same machine-inspect path as macOS is used.
 *
 * Best-effort: returns null if `podman` isn't on PATH, no machine/socket is found, or the
 * platform is unrecognized -- callers should leave DOCKER_HOST unset in that case and let
 * Harbor's own doctor gate surface a clear error rather than silently pointing at nothing.
 * Result is memoized per process (this shells out to `podman`, and buildHarborEnv() runs on
 * every child spawn).
 */
export function resolvePodmanDockerHost(): string | null {
  if (cachedPodmanDockerHost !== undefined) return cachedPodmanDockerHost;

  const run = (args: string[]): string | null => {
    try {
      return execFileSync("podman", args, { stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim() || null;
    } catch {
      return null;
    }
  };
  const asUnixUrl = (path: string | null): string | null =>
    path ? (path.startsWith("unix://") ? path : `unix://${path}`) : null;

  let result: string | null = null;
  if (process.platform === "win32") {
    result = "npipe:////./pipe/docker_engine";
  } else if (process.platform === "darwin") {
    result = asUnixUrl(run(["machine", "inspect", "--format", "{{.ConnectionInfo.PodmanSocket.Path}}"]));
  } else if (process.platform === "linux") {
    const machinesJson = run(["machine", "list", "--format", "json"]);
    let hasActiveMachine = false;
    if (machinesJson) {
      try {
        hasActiveMachine = (JSON.parse(machinesJson) as Array<{ Running?: boolean }>).some((m) => m.Running);
      } catch {
        hasActiveMachine = false;
      }
    }
    result = hasActiveMachine
      ? asUnixUrl(run(["machine", "inspect", "--format", "{{.ConnectionInfo.PodmanSocket.Path}}"]))
      : asUnixUrl(run(["info", "--format", "{{.Host.RemoteSocket.Path}}"]));
  }

  cachedPodmanDockerHost = result;
  return result;
}

/**
 * Harbor's CLI callback fires PostHog telemetry on every command by default
 * (harbor/telemetry.py: capture_command_finished/capture_job_finished, wired into
 * harbor/cli/main.py's top-level callback) -- agent names, model provider+name, reward,
 * cost, token counts and an anonymous install id leave the machine unless this is set.
 * Verified no API key ever enters that payload (it's filtered through a fixed field
 * allowlist), but usage data does, which this kit disables unconditionally: unlike the
 * DOCKER_HOST pipe redirect below, this isn't Windows/Podman-specific plumbing, so it must
 * not be skippable via dockerHostFix/--no-docker-host-fix.
 */
function withTelemetryDisabled(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (env.HARBOR_TELEMETRY === undefined) env.HARBOR_TELEMETRY = "disabled";
  return env;
}

/**
 * Harbor's CLI (via `rich`) prints emoji straight to stdout (e.g. "\U0001f50d" before
 * "Analyzing trial(s)..." in harbor/cli/analyze.py). Spawned as a child process on Windows,
 * Python defaults its stdout encoding to the console's active code page (cp1252 unless the
 * terminal itself is already in UTF-8 mode) instead of UTF-8, so that print crashes with
 * UnicodeEncodeError before the command does anything else -- reproduced running `harbor
 * analyze` through this GUI. Forcing UTF-8 here fixes it regardless of the host console's
 * code page, same unconditional-fix pattern as withTelemetryDisabled above.
 */
function withPythonUtf8(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (env.PYTHONIOENCODING === undefined) env.PYTHONIOENCODING = "utf-8";
  return env;
}

export function buildHarborEnv(extraEnv: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extraEnv };
  if (env.DOCKER_HOST === undefined) {
    const dockerHost = resolvePodmanDockerHost();
    if (dockerHost) env.DOCKER_HOST = dockerHost;
  }
  return withPythonUtf8(withTelemetryDisabled(env));
}

export function execCommand(
  cmd: string,
  args: string[],
  opts: ExecOptions = {}
): Promise<ExecResult> {
  return new Promise((resolvePromise) => {
    const start = Date.now();
    const dockerHostFix = opts.dockerHostFix ?? true;
    const env = dockerHostFix
      ? buildHarborEnv(opts.extraEnv)
      : withPythonUtf8(withTelemetryDisabled({ ...process.env, ...opts.extraEnv }));
    const child = spawn(cmd, args, { env, cwd: opts.cwd });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill();
        }, opts.timeoutMs)
      : undefined;
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
      if (opts.echo) process.stdout.write(d);
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
      if (opts.echo) process.stderr.write(d);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolvePromise({
        code: timedOut ? 1 : code ?? 1,
        stdout,
        stderr: timedOut ? `${stderr}\n[killed: exceeded ${opts.timeoutMs}ms timeout]` : stderr,
        durationSec: (Date.now() - start) / 1000,
      });
    });
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      resolvePromise({
        code: 1,
        stdout,
        stderr: stderr + String(err),
        durationSec: (Date.now() - start) / 1000,
      });
    });
  });
}

export function execHarbor(args: string[], opts: ExecOptions = {}): Promise<ExecResult> {
  return execCommand("harbor", args, opts);
}

export function isHarborAvailable(): boolean {
  try {
    execFileSync("harbor", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export async function runPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function runner(): Promise<void> {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await worker(items[idx], idx);
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, () => runner());
  await Promise.all(runners);
  return results;
}

// ---------- Result parsing / reporting ----------

export function parseResult(jobDir: string): {
  nTrials?: number;
  nErrors?: number;
  meanReward?: number;
  costUsd?: number;
  nInputTokens?: number;
  nOutputTokens?: number;
  error?: string;
} {
  const resultPath = join(jobDir, "result.json");
  if (!existsSync(resultPath)) return { error: "result.json not found" };
  try {
    const data = JSON.parse(readFileSync(resultPath, "utf-8")) as HarborResultJson;
    const stats = data.stats;
    if (!stats) return { error: "no 'stats' in result.json" };
    const evalEntries = Object.values(stats.evals ?? {});
    let totalTrials = 0;
    let weightedSum = 0;
    for (const e of evalEntries) {
      const mean = e.metrics?.[0]?.mean;
      const n = e.n_trials ?? 0;
      if (typeof mean === "number" && n > 0) {
        totalTrials += n;
        weightedSum += mean * n;
      }
    }
    return {
      nTrials: stats.n_completed_trials,
      nErrors: stats.n_errored_trials,
      meanReward: totalTrials > 0 ? weightedSum / totalTrials : undefined,
      costUsd: stats.cost_usd,
      nInputTokens: stats.n_input_tokens,
      nOutputTokens: stats.n_output_tokens,
    };
  } catch (err) {
    return { error: String(err) };
  }
}

export function csvEscape(v: unknown): string {
  if (v === undefined || v === null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function writeReport(rows: ResultRow[], outPrefix: string): void {
  writeFileSync(`${outPrefix}.json`, JSON.stringify(rows, null, 2));
  const headers: (keyof ResultRow)[] = [
    "jobName",
    "agent",
    "model",
    "skillset",
    "ok",
    "nTrials",
    "nErrors",
    "meanReward",
    "durationSec",
    "costUsd",
    "nInputTokens",
    "nOutputTokens",
    "error",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => csvEscape(r[h])).join(","));
  writeFileSync(`${outPrefix}.csv`, lines.join("\n") + "\n");
}

// ---------- State dir / registries ----------

export function getStateDir(): string {
  return process.env.HARBOR_EVAL_STATE_DIR || join(homedir(), ".harbor-eval-kit");
}

export function getRegistryPath(name: RegistryName): string {
  return join(getStateDir(), "registries", `${name}.json`);
}

export function readRegistry<T>(name: RegistryName): T[] {
  const p = getRegistryPath(name);
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as T[];
  } catch {
    return [];
  }
}

export function writeRegistry<T>(name: RegistryName, items: T[]): void {
  const p = getRegistryPath(name);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(items, null, 2));
}

export function newId(): string {
  return randomUUID();
}

// ---------- Skill materialization ----------
// A Skill authored in the GUI (free-text instructions) has no filesystem home of its
// own; Harbor's --skill only understands a directory containing SKILL.md. These helpers
// write/refresh that file on demand under the state dir so both Skills and per-agent
// "instructions" (treated as an implicit one-off skill) resolve to a real path.

function getManagedSkillDir(key: string): string {
  return join(getStateDir(), "skills", key);
}

/** Joins `relativeName` onto `dir`, refusing anything that would resolve outside `dir`
 *  (`..` segments, absolute paths) -- extra-file names come from the GUI/API body, not a
 *  trusted source, and this only ever runs against the local filesystem. */
function safeJoinUnderDir(dir: string, relativeName: string): string | null {
  const target = join(dir, relativeName);
  const rel = relative(dir, target);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return target;
}

function materializeSkillMd(
  key: string,
  instructions: string,
  extraFiles?: { name: string; content: string }[]
): string {
  const dir = getManagedSkillDir(key);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), instructions ?? "", "utf-8");
  for (const f of extraFiles ?? []) {
    const name = (f.name ?? "").trim();
    if (!name) continue;
    const target = safeJoinUnderDir(dir, name);
    if (!target) continue;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, f.content ?? "", "utf-8");
  }
  return dir;
}

export function resolveSkillPath(skill: SkillEntry): string | null {
  if (skill.mode === "path") {
    return skill.path && skill.path.trim() ? skill.path.trim() : null;
  }
  return materializeSkillMd(`skill-${skill.id}`, skill.instructions ?? "", skill.extraFiles);
}

export function resolveSkillsetPaths(skillIds: string[], skills: SkillEntry[]): string[] {
  const paths: string[] = [];
  for (const id of skillIds) {
    const skill = skills.find((s) => s.id === id);
    if (!skill) continue;
    const p = resolveSkillPath(skill);
    if (p) paths.push(p);
  }
  return paths;
}

/** Agent-level "instructions" are treated as an implicit skill, always attached to its runs. */
export function resolveAgentInstructionsPath(agent: AgentEntry): string | null {
  if (!agent.instructions || !agent.instructions.trim()) return null;
  return materializeSkillMd(`agent-${agent.id}`, agent.instructions);
}

// ---------- Judge rubrics ----------
// A rubric authored in the GUI has no filesystem home of its own; `harbor analyze --rubric`
// only understands a TOML/YAML/JSON file matching harbor's Rubric schema (confirmed against
// the installed package's harbor/analyze/prompts/analyze-rubric.toml: a list of
// {name, description, guidance} criterion tables). Materialize on demand, same pattern as skills.

function tomlEscape(s: string): string {
  return (s ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n");
}

export function serializeRubricToml(criteria: RubricCriterion[]): string {
  return criteria
    .map(
      (c) =>
        `[[criteria]]\nname = "${tomlEscape(c.name)}"\ndescription = "${tomlEscape(c.description)}"\nguidance = "${tomlEscape(c.guidance)}"\n`
    )
    .join("\n");
}

export function resolveRubricCriteria(criterionIds: string[], criteria: CriterionEntry[]): RubricCriterion[] {
  return criterionIds
    .map((id) => criteria.find((c) => c.id === id))
    .filter((c): c is CriterionEntry => Boolean(c))
    .map((c) => ({ name: c.name, description: c.description, guidance: c.guidance }));
}

export function resolveRubricPath(rubricId: string, resolvedCriteria: RubricCriterion[]): string {
  const dir = join(getStateDir(), "rubrics", rubricId);
  mkdirSync(dir, { recursive: true });
  const p = join(dir, "rubric.toml");
  writeFileSync(p, serializeRubricToml(resolvedCriteria), "utf-8");
  return p;
}

// ---------- Judges ----------
// A Judge's custom instructions map to `harbor analyze --prompt <file>`, which replaces
// harbor's own analyze/prompts/analyze.txt wholesale (confirmed in analyzer.py: `prompt_path`
// is read as-is instead of the default template, then `.format_map()`-rendered with
// trial_path/task_section/criteria_guidance). Materialize on demand, same pattern as rubrics.

export function resolveJudgePromptPath(judgeId: string, promptTemplate: string): string {
  const dir = join(getStateDir(), "judges", judgeId);
  mkdirSync(dir, { recursive: true });
  const p = join(dir, "prompt.txt");
  writeFileSync(p, promptTemplate, "utf-8");
  return p;
}

/**
 * Reads `<path>/analysis.json` if `harbor analyze` wrote one there (confirmed in
 * analyzer.py:_write_analysis_json). Best-effort: returns null rather than throwing if the
 * file is missing or the shape differs from what this Harbor version produced when this was
 * written -- callers should fall back to showing raw stdout in that case.
 */
export function parseAnalysisJson(path: string): unknown | null {
  const p = join(path, "analysis.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

// ---------- Secrets ----------
// Local KEY=VALUE file in the state dir, never returned by value over the API,
// never written into the installation manifest, never logged.

export function getSecretsPath(): string {
  return join(getStateDir(), "secrets.env");
}

export function loadSecretsEnv(): Record<string, string> {
  const p = getSecretsPath();
  if (!existsSync(p)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(p, "utf-8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return out;
}

export function listSecretNames(): string[] {
  return Object.keys(loadSecretsEnv()).sort();
}

function writeSecretsEnv(secrets: Record<string, string>): void {
  const p = getSecretsPath();
  mkdirSync(dirname(p), { recursive: true });
  const lines = Object.entries(secrets).map(([k, v]) => `${k}=${v}`);
  writeFileSync(p, lines.join("\n") + (lines.length ? "\n" : ""), { mode: 0o600 });
}

export function saveSecret(name: string, value: string): void {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
    throw new Error("Secret name must be UPPER_SNAKE_CASE (e.g. ANTHROPIC_API_KEY)");
  }
  if (/[\r\n]/.test(value)) {
    throw new Error("Secret value cannot contain newlines");
  }
  const secrets = loadSecretsEnv();
  secrets[name] = value;
  writeSecretsEnv(secrets);
}

export function deleteSecret(name: string): void {
  const secrets = loadSecretsEnv();
  delete secrets[name];
  writeSecretsEnv(secrets);
}

// ---------- Providers (canonical list, shared by Secrets/Models UI and the key-test route)
// ----------
// `id` doubles as LiteLLM's `custom_llm_provider` string (confirmed against the installed
// litellm package's provider config manager) -- it's what /api/secrets/test passes to
// `litellm.get_valid_models`/`litellm.completion`. `prefixes` is the "provider/model" prefix
// convention used everywhere else in this kit (model registry values, guessProviderKey in the
// GUI). `envKey: null` marks providers with no simple API-key env var (local runtimes,
// cloud-credential-based auth) -- these never get a "Test key" button.
export interface ProviderEntry {
  id: string;
  label: string;
  prefixes: string[];
  envKey: string | null;
}

export const PROVIDERS: ProviderEntry[] = [
  { id: "anthropic", label: "Anthropic", prefixes: ["anthropic/"], envKey: "ANTHROPIC_API_KEY" },
  { id: "openai", label: "OpenAI", prefixes: ["openai/"], envKey: "OPENAI_API_KEY" },
  { id: "azure", label: "Azure OpenAI", prefixes: ["azure/"], envKey: "AZURE_API_KEY" },
  { id: "deepseek", label: "DeepSeek", prefixes: ["deepseek/"], envKey: "DEEPSEEK_API_KEY" },
  { id: "gemini", label: "Google Gemini", prefixes: ["gemini/", "google/"], envKey: "GEMINI_API_KEY" },
  { id: "vertex_ai", label: "Google Vertex AI", prefixes: ["vertex_ai/"], envKey: "VERTEXAI_API_KEY" },
  { id: "openrouter", label: "OpenRouter", prefixes: ["openrouter/"], envKey: "OPENROUTER_API_KEY" },
  { id: "groq", label: "Groq", prefixes: ["groq/"], envKey: "GROQ_API_KEY" },
  { id: "mistral", label: "Mistral", prefixes: ["mistral/"], envKey: "MISTRAL_API_KEY" },
  { id: "cohere", label: "Cohere", prefixes: ["cohere/"], envKey: "COHERE_API_KEY" },
  { id: "xai", label: "xAI (Grok)", prefixes: ["xai/"], envKey: "XAI_API_KEY" },
  { id: "together_ai", label: "Together AI", prefixes: ["together_ai/"], envKey: "TOGETHERAI_API_KEY" },
  { id: "fireworks_ai", label: "Fireworks AI", prefixes: ["fireworks_ai/"], envKey: "FIREWORKS_AI_API_KEY" },
  { id: "ollama", label: "Ollama (local, sem key)", prefixes: ["ollama/"], envKey: null },
  { id: "bedrock", label: "AWS Bedrock (credenciais AWS, não API key simples)", prefixes: ["bedrock/"], envKey: null },
];

// ---------- Provider key testing / model discovery ----------
// Neither of these has a `harbor` CLI surface (confirmed: `harbor --help` has no model-listing
// or key-check command) -- they call LiteLLM directly, in the same Python environment `harbor`
// itself runs in (LiteLLM is one of its hard dependencies), via a small materialized script.

let cachedHarborPythonPath: string | null | undefined;

/** Locates the python interpreter inside the `uv tool install harbor` venv (portable across
 *  OS via `uv tool dir`, rather than hardcoding uv's storage layout). Memoized per process. */
export function getHarborPythonPath(): string | null {
  if (cachedHarborPythonPath !== undefined) return cachedHarborPythonPath;
  let result: string | null = null;
  try {
    const toolsDir = execFileSync("uv", ["tool", "dir"], { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    const candidate =
      process.platform === "win32"
        ? join(toolsDir, "harbor", "Scripts", "python.exe")
        : join(toolsDir, "harbor", "bin", "python");
    result = existsSync(candidate) ? candidate : null;
  } catch {
    result = null;
  }
  cachedHarborPythonPath = result;
  return result;
}

const TEST_PROVIDER_KEY_SCRIPT = `
import json, os, sys

provider = sys.argv[1]
env_name = sys.argv[2]

result = {"ok": False, "testedModel": None, "discoveredModels": [], "error": None}
try:
    import litellm
    litellm.suppress_debug_info = True

    discovered = []
    try:
        discovered = litellm.get_valid_models(
            check_provider_endpoint=True, custom_llm_provider=provider
        )
    except Exception:
        discovered = []

    candidate = discovered[0] if discovered else None
    if candidate is None:
        static_models = list(litellm.models_by_provider.get(provider, []))
        candidate = static_models[0] if static_models else None

    if candidate is None:
        result["error"] = "no known model id for provider '%s' to test against" % provider
    else:
        model_ref = candidate if "/" in candidate else "%s/%s" % (provider, candidate)
        litellm.completion(
            model=model_ref,
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=5,
            timeout=20,
        )
        result["ok"] = True
        result["testedModel"] = model_ref
        result["discoveredModels"] = discovered
except Exception as e:
    result["error"] = "%s: %s" % (type(e).__name__, e)

print(json.dumps(result))
`;

function getTestProviderKeyScriptPath(): string {
  const p = join(getStateDir(), "test-provider-key.py");
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, TEST_PROVIDER_KEY_SCRIPT, "utf-8");
  return p;
}

export interface ProviderKeyTestResult {
  ok: boolean;
  testedModel: string | null;
  discoveredModels: string[];
  error: string | null;
}

/**
 * Makes one real, minimal call to the cheapest model LiteLLM knows for `provider` (`hi`,
 * `max_tokens: 5`) using the already-saved secret named `envKey` -- confirms the key actually
 * works, not just that it's saved, and opportunistically returns whatever live model catalog
 * LiteLLM could fetch for that provider along the way (empty if the provider has no
 * live-listing support in this LiteLLM version -- that's not itself a failure).
 *
 * The API key is passed to the child process via environment variable only (never argv, which
 * would be visible to other processes/logs on multi-user systems) -- same secrecy discipline
 * as every other `harbor`/`podman` child spawn in this file.
 */
export async function testProviderKey(provider: string, envKey: string): Promise<ProviderKeyTestResult> {
  const pythonPath = getHarborPythonPath();
  if (!pythonPath) {
    return {
      ok: false,
      testedModel: null,
      discoveredModels: [],
      error: "could not locate the python interpreter inside the harbor uv tool venv (is Harbor installed via 'uv tool install harbor'?)",
    };
  }
  const secrets = loadSecretsEnv();
  const apiKey = secrets[envKey];
  if (!apiKey) {
    return { ok: false, testedModel: null, discoveredModels: [], error: `no secret named ${envKey} is saved` };
  }
  const scriptPath = getTestProviderKeyScriptPath();
  const result = await execCommand(pythonPath, [scriptPath, provider, envKey], {
    dockerHostFix: false,
    extraEnv: { [envKey]: apiKey },
    timeoutMs: 30_000,
  });
  try {
    return JSON.parse(result.stdout.trim().split("\n").pop() ?? "") as ProviderKeyTestResult;
  } catch {
    return {
      ok: false,
      testedModel: null,
      discoveredModels: [],
      error: (result.stderr || result.stdout || `exit ${result.code}`).trim().slice(-2000),
    };
  }
}

// ---------- Task file editing ----------
// A task directory (created by `harbor init --task`) is plain project content meant to
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

// ---------- Harbor agent adapters ----------
/**
 * The `--agent` values the installed Harbor accepts, from `harbor run --help` (Harbor 0.22.0).
 * The GUI used to only hint at four of these in prose, which made the most useful question
 * unanswerable from the UI: *which adapter can drive a non-Anthropic model?* Not every adapter
 * is model-agnostic -- a vendor CLI adapter (claude-code, codex, gemini-cli, ...) speaks its
 * own vendor's API, so pairing it with an arbitrary `--model` is not something this kit can
 * promise. `modelAgnostic: true` marks the LiteLLM-backed adapters that take any
 * `provider/model` string; those are the ones to pick when comparing across providers.
 *
 * Validated end-to-end on 2026-09-06: `mini-swe-agent` + `deepseek/deepseek-chat` scored
 * reward 1.0 on a real task for $0.0017.
 *
 * This is a hand-maintained mirror of Harbor's own list, not something Harbor exposes
 * machine-readably (`harbor agent list` does not exist -- confirmed: "No such command").
 * Re-check it against `harbor run --help` when upgrading Harbor.
 */
export const HARBOR_AGENTS: { value: string; modelAgnostic: boolean }[] = [
  { value: "aider", modelAgnostic: true },
  { value: "antigravity-cli", modelAgnostic: false },
  { value: "antigravity-sdk", modelAgnostic: false },
  { value: "claude-code", modelAgnostic: false },
  { value: "cline-cli", modelAgnostic: true },
  { value: "codex", modelAgnostic: false },
  { value: "computer-1", modelAgnostic: false },
  { value: "copilot-cli", modelAgnostic: false },
  { value: "cortex-code", modelAgnostic: false },
  { value: "cursor-cli", modelAgnostic: false },
  { value: "deerflow", modelAgnostic: true },
  { value: "devin", modelAgnostic: false },
  { value: "dspy-rlm", modelAgnostic: true },
  { value: "eve", modelAgnostic: false },
  { value: "fx", modelAgnostic: false },
  { value: "gemini-cli", modelAgnostic: false },
  { value: "goose", modelAgnostic: true },
  { value: "grok-build", modelAgnostic: false },
  { value: "hermes", modelAgnostic: false },
  { value: "junie", modelAgnostic: false },
  { value: "kimi-cli", modelAgnostic: false },
  { value: "kimi-code", modelAgnostic: false },
  { value: "langgraph", modelAgnostic: true },
  { value: "mcode", modelAgnostic: false },
  { value: "mimo", modelAgnostic: false },
  { value: "mini-swe-agent", modelAgnostic: true },
  { value: "nemo-agent", modelAgnostic: false },
  { value: "nop", modelAgnostic: false },
  { value: "openclaw", modelAgnostic: false },
  { value: "opencode", modelAgnostic: true },
  { value: "openhands", modelAgnostic: true },
  { value: "openhands-sdk", modelAgnostic: true },
  { value: "oracle", modelAgnostic: false },
  { value: "pi", modelAgnostic: false },
  { value: "qwen-coder", modelAgnostic: false },
  { value: "rovodev-cli", modelAgnostic: false },
  { value: "swe-agent", modelAgnostic: true },
  { value: "terminus", modelAgnostic: true },
  { value: "terminus-1", modelAgnostic: true },
  { value: "terminus-2", modelAgnostic: true },
  { value: "trae-agent", modelAgnostic: true },
  { value: "vibe", modelAgnostic: false },
];

/** `oracle` (applies the task's own solution/solve.sh) and `nop` (does nothing) call no LLM at
 *  all -- the zero-cost way to check a task's test.sh rewards correctly before spending API. */
export const FREE_AGENTS = ["oracle", "nop"];

// ---------- Job logs ----------

export interface JobLogListing {
  /** Path relative to the jobs dir, usable as the `job` query param of the tail endpoint. */
  name: string;
  /** Epoch ms of the most recently touched log file inside this job dir. */
  mtimeMs: number;
  running: boolean;
}

/**
 * Lists job directories under `jobsDir`, newest first. `running` is read from the job's own
 * result.json (`finished_at: null` while harbor is still working) rather than from any state
 * this server keeps -- so a job started by the CLI, or one still going after a `gui-server`
 * restart, is reported just as accurately as one this process spawned.
 */
export function listJobLogs(jobsDir: string): JobLogListing[] {
  if (!existsSync(jobsDir)) return [];
  const out: JobLogListing[] = [];
  for (const entry of readdirSync(jobsDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const dir = join(jobsDir, entry.name);
    let mtimeMs = 0;
    try {
      mtimeMs = statSync(dir).mtimeMs;
    } catch {
      continue;
    }
    let running = false;
    const resultPath = join(dir, "result.json");
    if (existsSync(resultPath)) {
      try {
        running = JSON.parse(readFileSync(resultPath, "utf-8")).finished_at === null;
      } catch {
        running = false;
      }
    }
    out.push({ name: entry.name, mtimeMs, running });
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/**
 * Every `.log` file inside one job dir (the job's own `job.log` plus each trial's `trial.log`),
 * newest first, as paths relative to the job dir.
 */
export function listJobLogFiles(jobsDir: string, job: string): string[] {
  const jobDir = safeJoinUnderDir(jobsDir, job);
  if (!jobDir || !existsSync(jobDir)) return [];
  const out: { rel: string; mtimeMs: number }[] = [];
  const walk = (dir: string, prefix: string, depth: number): void => {
    if (depth > 3) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name);
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walk(abs, rel, depth + 1);
      else if (e.name.endsWith(".log") || e.name.endsWith(".txt")) {
        try {
          out.push({ rel, mtimeMs: statSync(abs).mtimeMs });
        } catch { /* file vanished mid-scan (harbor rotating artifacts) -- skip it */ }
      }
    }
  };
  walk(jobDir, "", 0);
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs).map((f) => f.rel);
}

export interface LogTail {
  content: string;
  /** Byte offset to pass back as `offset` next poll, so only new bytes cross the wire. */
  nextOffset: number;
  size: number;
  truncated: boolean;
}

/**
 * Reads a log file from `offset` to EOF. Both path segments are guarded with
 * safeJoinUnderDir, so a crafted `job`/`file` can never escape the jobs dir. A file that
 * shrank since the last poll (harbor rewrote it) resets the offset to 0 instead of returning
 * garbage.
 */
export function tailJobLog(jobsDir: string, job: string, file: string, offset: number): LogTail | null {
  const jobDir = safeJoinUnderDir(jobsDir, job);
  if (!jobDir) return null;
  const target = safeJoinUnderDir(jobDir, file);
  if (!target || !existsSync(target)) return null;
  const size = statSync(target).size;
  const MAX_BYTES = 200_000;
  let start = offset > size ? 0 : Math.max(0, offset);
  let truncated = false;
  if (size - start > MAX_BYTES) {
    start = size - MAX_BYTES;
    truncated = true;
  }
  const fd = openSync(target, "r");
  try {
    const length = size - start;
    if (length <= 0) return { content: "", nextOffset: size, size, truncated: false };
    const buf = Buffer.alloc(length);
    readSync(fd, buf, 0, length, start);
    return { content: buf.toString("utf-8"), nextOffset: size, size, truncated };
  } finally {
    closeSync(fd);
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
  return join(getStateDir(), "task-rubric-defaults.json");
}

function readTaskRubricDefaults(): Record<string, TaskRubricDefault> {
  const p = getTaskRubricDefaultsPath();
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return {};
  }
}

export function getTaskRubricDefault(taskPath: string): TaskRubricDefault {
  return readTaskRubricDefaults()[taskPath] ?? {};
}

export function setTaskRubricDefault(taskPath: string, value: TaskRubricDefault): void {
  const all = readTaskRubricDefaults();
  if ((!value.rubricIds || value.rubricIds.length === 0) && !value.judgeId) {
    delete all[taskPath];
  } else {
    all[taskPath] = value;
  }
  const p = getTaskRubricDefaultsPath();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(all, null, 2));
}
