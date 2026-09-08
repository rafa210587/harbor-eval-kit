import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateRegistrySnapshot } from "./registry-validation.ts";
import { assertSafeExport } from "./export-safety.ts";
import { createExperimentPlan, resolveRegisteredCandidates } from "./experiment-plan.ts";
import { isJudgeModelAllowed } from "./catalog.ts";
import { resolveRubricCriteria, serializeRubricToml } from "./materialize.ts";

const root = resolve(import.meta.dirname, "../..");
const bundle = JSON.parse(readFileSync(resolve(root, "config/teste-live/catalogo-teste-live.json"), "utf8"));
const registries = bundle.registries;

test("catálogo teste-live importa sem referências quebradas e exporta sem armazenamento sensível", () => {
  assert.equal(bundle.version, 1);
  validateRegistrySnapshot(registries);
  assertSafeExport(bundle, {});
  assert.deepEqual(Object.keys(registries).sort(), ["agents", "criteria", "judges", "models", "rubrics", "skills", "skillsets"]);
  for (const entries of Object.values(registries) as { id: string; label?: string; name?: string }[][]) {
    for (const item of entries) {
      assert.ok(item.id.endsWith("teste-live"));
      assert.ok((item.label ?? item.name)?.endsWith("teste-live"));
    }
  }
});

test("as três tasks têm plano equivalente para quatro modelos e duas skills", () => {
  const candidates = resolveRegisteredCandidates(registries.agents.map((a: { id: string }) => ({ agentId: a.id })), registries);
  assert.equal(candidates.length, 4);
  assert.equal(new Set(candidates.map(c => c.model)).size, 4);
  for (const candidate of candidates) {
    assert.equal(candidate.agent, "mini-swe-agent");
    assert.deepEqual(candidate.skills.map(s => s.id), ["codificacao-teste-live", "validacao-teste-live"]);
  }
  for (const level of ["simples", "media", "dificil"]) {
    const plan = createExperimentPlan({ path: resolve(root, `evals/python/${level}-teste-live`), jobsDir: resolve(root, "jobs/teste-live"), dryRun: true }, candidates);
    assert.equal(plan.tasks.length, 1);
    assert.equal(plan.candidates.length * plan.nAttempts, 4);
    assert.equal(plan.concurrency, 1);
  }
});

test("ablação remove skills apenas da linha escolhida", () => {
  const [baseline, withSkills] = resolveRegisteredCandidates([
    { agentId: "agente-flash-teste-live", skillsetIds: [] },
    { agentId: "agente-flash-teste-live" },
  ], registries);
  assert.equal(baseline.model, withSkills.model);
  assert.equal(baseline.agent, withSkills.agent);
  assert.equal(baseline.skills.length, 0);
  assert.equal(withSkills.skills.length, 2);
});

test("os dois juízes usam a mesma rubrica de oito critérios e modelos permitidos", () => {
  assert.equal(registries.judges.length, 2);
  assert.equal(new Set(registries.judges.map((j: { promptTemplate: string }) => j.promptTemplate)).size, 1);
  for (const judge of registries.judges) {
    assert.ok(isJudgeModelAllowed(registries.models.find((m: { id: string }) => m.id === judge.modelId).value));
    assert.deepEqual(judge.defaultRubricIds, ["rubrica-engenharia-teste-live"]);
    for (const marker of ["{trial_path}", "{task_section}", "{criteria_guidance}"]) assert.ok(judge.promptTemplate.includes(marker));
  }
  const criteria = resolveRubricCriteria(registries.rubrics[0].criterionIds, registries.criteria);
  assert.equal(criteria.length, 8);
  assert.equal(new Set(criteria.map(c => c.name)).size, 8);
  assert.equal(serializeRubricToml(criteria).match(/\[\[criteria\]\]/g)?.length, 8);
});
