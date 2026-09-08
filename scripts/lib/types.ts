// Shared types for the Harbor Eval Kit library. No logic, no imports -- every other
// module in lib/ imports from here, so it must stay dependency-free.

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
  passRate?: number;
  judgeCostUsd?: number;
  error?: string;
}

export interface ExecOptions {
  /** Explicit connection: inherit only host bootstrap variables, not ambient provider auth/gateway. */
  isolatedEnv?: boolean;
  /** Mirror stdout/stderr to this process's own streams as they arrive. */
  echo?: boolean;
  /** Inject the Podman-forwarded DOCKER_HOST for this child only (default: true on win32). */
  dockerHostFix?: boolean;
  extraEnv?: Record<string, string>;
  /** Values that must be removed from captured and streamed child output. */
  redactValues?: string[];
  cwd?: string;
  /** Kill the child if it hasn't exited after this many ms (default: no timeout). */
  timeoutMs?: number;
  /**
   * Called with the live child process right after spawn, before this call resolves. This is
   * the seam a caller uses to cancel a run in progress (see gui-server.ts's /api/compare/cancel):
   * without a hook here, the only handle to a spawned `harbor run` is inside this promise, and a
   * long-running compare can't be stopped from outside it.
   */
  onSpawn?: (child: import("node:child_process").ChildProcess) => void;
  /** Receives already-redacted output chunks while the child is running. */
  onOutput?: (stream: "stdout" | "stderr", text: string) => void;
}

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
  durationSec: number;
}

export interface AgentEntry {
  id: string;
  /** Local harness connection; exported catalogs require rebinding on the destination. */
  integrationId?: string;
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
  timeoutHours?: number;
  integrationId?: string;
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
