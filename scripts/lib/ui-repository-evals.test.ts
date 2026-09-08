import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkFromDraft, importedRecipe, parseArgv, parseExitCodes, recipeProblems, sourceFromDraft } from "../../gui/app/repository-evals-domain.js";

test("repository checks preserve argv boundaries and validate deterministic fields", () => {
  assert.deepEqual(parseArgv('["pytest","-q","tests/unit test.py"]'), ["pytest", "-q", "tests/unit test.py"]);
  assert.throws(() => parseArgv("pytest -q"), /array JSON/);
  assert.throws(() => parseArgv('["pytest", 3]'), /somente com strings/);
  assert.deepEqual(parseExitCodes("0, 2, 0"), [0, 2]);
  assert.throws(() => parseExitCodes("0,ok"), /inteiros/);
  assert.deepEqual(checkFromDraft({ id: "tests", argv: '["pytest","-q"]', cwd: ".", timeoutSec: "300", acceptedExitCodes: "0", weight: "1.5", required: true }), {
    id: "tests", argv: ["pytest", "-q"], cwd: ".", timeoutSec: 300, acceptedExitCodes: [0], weight: 1.5, required: true,
  });
});

test("repository sources keep explicit refs for local and remote Git and recipe gates every wizard step", () => {
  assert.deepEqual(sourceFromDraft("local", " D:/repo ", "main"), { kind: "local", location: "D:/repo", ref: "main" });
  assert.deepEqual(sourceFromDraft("git", "https://example/repo.git", "main"), { kind: "git", location: "https://example/repo.git", ref: "main" });
  const valid = { label: "Feature", codeSource: { kind: "local", location: "D:/repo" }, specPaths: ["spec.md"], reference: { repository: "owner/repo", prNumber: 42 }, checks: [{ required: true }], trusted: true };
  assert.deepEqual(recipeProblems(valid), []);
  assert.deepEqual(recipeProblems({ ...valid, agentTimeoutSec: 72 * 3600 }), []);
  for (const agentTimeoutSec of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.match(recipeProblems({ ...valid, agentTimeoutSec }).join(" "), /Prazo do agente/);
  }
  assert.deepEqual(recipeProblems({ ...valid, threshold: 0.8 }), []);
  assert.match(recipeProblems({ ...valid, threshold: -0.1 }).join(" "), /Limiar/);
  assert.match(recipeProblems({ ...valid, specPaths: [] }, 1).join(" "), /documento/);
  assert.match(recipeProblems({ ...valid, reference: { repository: "repo", prNumber: 0 } }, 2).join(" "), /owner\/repo/);
  assert.match(recipeProblems({ ...valid, checks: [{ required: false }] }, 3).join(" "), /obrigatório/);
  assert.match(recipeProblems({ ...valid, trusted: false }, 4).join(" "), /confiável/);
});

test("import remains a preview and prepare uses the frozen preview id", () => {
  const recipe = { label: "Imported" };
  assert.equal(importedRecipe({ recipe }), recipe);
  assert.throws(() => importedRecipe(null), /não contém/);
  const source = readFileSync(new URL("../../gui/app/repository-evals.js", import.meta.url), "utf8");
  assert.match(source, /\{ recipe: value, previewId, operationId \}/);
  assert.match(source, /function invalidate\(\)[\s\S]*previewId = "";[\s\S]*prepare\.disabled = true/);
  assert.match(source, /\/api\/repository-evals\/import[\s\S]*applyRecipe\(importedRecipe\(response\)\)/);
  assert.match(source, /Usar esta task em Novo experimento[\s\S]*refreshTaskList\(\)[\s\S]*activateTab\("compare"\)/);
});

test("repository catalog pickers subscribe to registry loading and preserve choices on refresh", () => {
  const source = readFileSync(new URL("../../gui/app/repository-evals.js", import.meta.url), "utf8");
  assert.match(source, /onRefresh\(renderCatalogPickers\)/);
  assert.match(source, /function renderCatalogPickers\(\)[\s\S]*const selectedJudge =/);
  assert.match(source, /\.value = selectedJudge/);
  assert.match(source, /input\.checked = selectedRubrics\.has\(input\.value\)/);
});
