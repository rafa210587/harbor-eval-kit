// Materialize judge rubrics/prompts. Task and skill inputs use immutable experiment snapshots.
import { mkdirSync, writeFileSync } from "node:fs";
import type { CriterionEntry, RubricCriterion } from "./types.ts";
import { managedPath } from "./paths.ts";
import { assertSafeId } from "./registry-validation.ts";

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
