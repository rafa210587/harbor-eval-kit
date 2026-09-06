// Naming and combination logic: turning agents/models/skillsets into the exact argv and job
// names Harbor sees. Pure functions -- the job-name format here is cited by the docs and
// pinned by tests, so changing it breaks example paths people copy.

import { basename } from "node:path";

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
