// Materialization: turning things authored in the GUI into the files Harbor actually
// understands. Harbor takes --skill <dir with SKILL.md>, --rubric <toml> and
// --prompt <file>, so free text has to be written to disk under the state dir before a run.

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";

import type { AgentEntry, CriterionEntry, RubricCriterion, SkillEntry } from "./types.ts";
import { managedPath, safeJoinUnderDir } from "./paths.ts";
import { assertSafeId, validateRegistryEntry } from "./registry-validation.ts";

// ---------- Skill materialization ----------
// A Skill authored in the GUI (free-text instructions) has no filesystem home of its
// own; Harbor's --skill only understands a directory containing SKILL.md. These helpers
// write/refresh that file on demand under the state dir so both Skills and per-agent
// "instructions" (treated as an implicit one-off skill) resolve to a real path.

function getManagedSkillDir(key: string): string {

  return managedPath("skills", key);
}

/**
 * Writes the skill's current contents as an EXACT snapshot: the managed directory is wiped
 * first, so a file the user removed in the GUI actually disappears from disk.
 *
 * Without the wipe this only ever added files. Harbor uploads the whole skill directory into
 * the agent's environment (harbor/trial/trial.py, `_upload_injected_skills`), not just
 * SKILL.md -- so a deleted example kept being handed to the agent, and the run was no longer
 * evaluating the skill the user was looking at. Silent, and it corrupts exactly the thing this
 * kit exists to measure.
 *
 * Only ever called for directories this kit owns under the state dir (`skills/<key>`), never
 * for a `mode: "path"` skill, which points at a folder belonging to the user.
 */
function materializeSkillMd(
  key: string,
  instructions: string,
  extraFiles?: { name: string; content: string }[]
): string {
  const dir = getManagedSkillDir(key);
  // Validate all names before removing the previous snapshot.
  for (const f of extraFiles ?? []) {
    if (!safeJoinUnderDir(dir, f.name)) throw new Error("arquivo extra fora do diretório gerenciado");
  }
  rmSync(dir, { recursive: true, force: true });
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
  validateRegistryEntry("skills", skill);
  if (skill.mode === "path") {
    return skill.path && skill.path.trim() ? skill.path.trim() : null;
  }
  return materializeSkillMd(`skill-${skill.id}`, skill.instructions ?? "", skill.extraFiles);
}

export function resolveSkillsetPaths(skillIds: string[], skills: SkillEntry[]): string[] {
  const paths: string[] = [];
  for (const id of skillIds) {
    const skill = skills.find((s) => s.id === id);
    if (!skill) throw new Error("skillset referencia skill inexistente");
    const p = resolveSkillPath(skill);
    if (p) paths.push(p);
  }
  return paths;
}

/** Agent-level "instructions" are treated as an implicit skill, always attached to its runs. */
export function resolveAgentInstructionsPath(agent: AgentEntry): string | null {
  validateRegistryEntry("agents", agent);
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
  if (criterionIds.some(id => !criteria.some(c => c.id === id))) throw new Error("rubric referencia critério inexistente");
  return criterionIds
    .map((id) => criteria.find((c) => c.id === id))
    .filter((c): c is CriterionEntry => Boolean(c))
    .map((c) => ({ name: c.name, description: c.description, guidance: c.guidance }));
}

export function resolveRubricPath(rubricId: string, resolvedCriteria: RubricCriterion[]): string {
  assertSafeId(rubricId);
  const dir = managedPath("rubrics", rubricId);
  mkdirSync(dir, { recursive: true });
  const p = managedPath("rubrics", rubricId, "rubric.toml");
  writeFileSync(p, serializeRubricToml(resolvedCriteria), "utf-8");
  return p;
}

// ---------- Judges ----------
// A Judge's custom instructions map to `harbor analyze --prompt <file>`, which replaces
// harbor's own analyze/prompts/analyze.txt wholesale (confirmed in analyzer.py: `prompt_path`
// is read as-is instead of the default template, then `.format_map()`-rendered with
// trial_path/task_section/criteria_guidance). Materialize on demand, same pattern as rubrics.

export function resolveJudgePromptPath(judgeId: string, promptTemplate: string): string {
  assertSafeId(judgeId);
  const dir = managedPath("judges", judgeId);
  mkdirSync(dir, { recursive: true });
  const p = managedPath("judges", judgeId, "prompt.txt");
  writeFileSync(p, promptTemplate, "utf-8");
  return p;
}
