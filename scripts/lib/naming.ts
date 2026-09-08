// Naming and combination logic: turning agents/models/skillsets into the exact argv and job
// names Harbor sees. Pure functions -- the job-name format here is cited by the docs and
// pinned by tests, so changing it breaks example paths people copy.

import { basename } from "node:path";
import { createHash } from "node:crypto";

import type { Combo, Skillset } from "./types.ts";

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

export const MAX_JOB_NAME_LENGTH = 70;

export interface JobIdentity {
  runId: string;
  candidateIndex: number;
}

/**
 * A plan already stores the full candidate metadata. Keep the directory name short and
 * readable, while retaining a full normal run id (or a bounded hash for an unusually long
 * custom id) so two runs cannot reuse a candidate path merely because their visible prefix is
 * the same.
 */
export function compactJobName(prefix: string, identity: JobIdentity): string {
  if (!Number.isSafeInteger(identity.candidateIndex) || identity.candidateIndex < 1) {
    throw new Error("candidateIndex deve ser inteiro positivo");
  }
  if (typeof identity.runId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(identity.runId)) {
    throw new Error("runId inválido para nome do job");
  }
  const safePrefix = sanitize(prefix).slice(0, 16) || "cmp";
  const suffix = `-c${identity.candidateIndex}`;
  const budget = MAX_JOB_NAME_LENGTH - safePrefix.length - 1 - suffix.length;
  const idPart = identity.runId.length <= budget
    ? identity.runId
    : createHash("sha256").update(identity.runId).digest("hex").slice(0, 16);
  return `${safePrefix}-${idPart}${suffix}`;
}

/** Legacy descriptive names remain readable for existing CLI/resource fixtures. New plans
 * pass a JobIdentity and use compactJobName instead. */
export function jobName(prefix: string, c: Combo, identity?: JobIdentity): string {
  if (identity) return compactJobName(prefix, identity);
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
