import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportRepositoryRecipe, listRepositoryRecipes, previewRepositoryRecipeImport, readRepositoryRecipe, recipeFingerprint, saveRepositoryRecipe, validateRepositoryRecipe } from "./repository-recipes.ts";
import { readRepositoryPreview, validatePreviewSelection } from "./repository-preparation.ts";

function recipe() {
  return { schemaVersion: 1 as const, id: "fixture-recipe", label: "Fixture", trusted: true as const,
    codeSource: { kind: "local" as const, location: "C:/private/company/source" }, documentSource: { kind: "local" as const, location: "C:/private/company/docs" },
    specPaths: ["spec.md"], reference: { repository: "owner/repo", prNumber: 12 },
    checks: [{ id: "tests", argv: ["python3", "-m", "unittest"], cwd: ".", timeoutSec: 30, acceptedExitCodes: [0], weight: 1, required: true }], image: "python:3.12-slim", setupScript: "" };
}
function state(t: any) { const root = mkdtempSync(join(tmpdir(), "harbor-eval-kit-recipes-test-")); t.after(() => rmSync(root, { recursive: true, force: true })); return root; }

test("recipe export hides private source paths and import preview has no write effects", t => {
  const root = state(t), original = validateRepositoryRecipe(recipe(), {}), bundle = exportRepositoryRecipe(original);
  assert.ok(!JSON.stringify(bundle).includes("private/company"));
  assert.deepEqual(bundle.requiredLocalSources, ["codeSource", "documentSource"]);
  assert.equal(original.codeSource.location, "C:/private/company/source");
  const before = readdirSync(root);
  const imported = previewRepositoryRecipeImport(bundle, root);
  assert.equal(imported.recipe.codeSource.location, "LOCAL_SOURCE_codeSource");
  assert.ok(imported.warnings.length);
  assert.deepEqual(readdirSync(root), before);
});

test("import preview reports an existing changed recipe without overwriting it", t => {
  const root = state(t), saved = saveRepositoryRecipe(recipe(), root);
  const bundle = exportRepositoryRecipe({ ...saved, label: "Changed" });
  const preview = previewRepositoryRecipeImport(bundle, root);
  assert.equal(preview.conflicts[0].id, saved.id);
  assert.equal(readRepositoryRecipe(saved.id, root).label, "Fixture");
});

test("recipe schema rejects unsafe sources, embedded credentials, escapes and unsupported fields", () => {
  for (const mutate of [
    (r: any) => { r.schemaVersion = 2; }, (r: any) => { r.credentials = {}; },
    (r: any) => { r.trusted = false; }, (r: any) => { r.codeSource = { kind: "git", location: "https://user:password@github.com/o/r" }; },
    (r: any) => { r.codeSource.ref = "--option"; }, (r: any) => { r.codeSource.includeWorkingTree = "yes"; },
    (r: any) => { r.specPaths = ["../spec.md"]; }, (r: any) => { r.specPaths = ["spec.md", "spec.md"]; },
    (r: any) => { r.reference.prNumber = -1; }, (r: any) => { r.reference.baseSha = "HEAD"; },
    (r: any) => { r.allowPassingBase = true; }, (r: any) => { r.checks[0].argv = ["echo", "known-sensitive-fixture"]; },
  ]) { const input = recipe(); mutate(input); assert.throws(() => validateRepositoryRecipe(input, { fixture: "known-sensitive-fixture" })); }
  assert.throws(() => previewRepositoryRecipeImport({ ...exportRepositoryRecipe(validateRepositoryRecipe(recipe(), {})), unexpected: true }));
});

test("recipe persistence roundtrip keeps registry isolated and rejects traversal IDs", t => {
  const root = state(t), saved = saveRepositoryRecipe(recipe(), root);
  assert.deepEqual(readRepositoryRecipe(saved.id, root), saved);
  assert.deepEqual(listRepositoryRecipes(root), [saved]);
  assert.throws(() => readRepositoryRecipe("../outside", root));
});

test("preview fingerprint rejects recipe edits and tampering before preparation", t => {
  const root = state(t), value = validateRepositoryRecipe(recipe(), {}), previewId = "fixture-preview", dir = join(root, "repository-previews", previewId);
  mkdirSync(dir, { recursive: true });
  const preview = { previewId, recipe: value, fingerprint: recipeFingerprint(value) };
  writeFileSync(join(dir, "preview.json"), JSON.stringify(preview));
  assert.equal(readRepositoryPreview(previewId, root).previewId, previewId);
  assert.equal(validatePreviewSelection(previewId, value, root).fingerprint, preview.fingerprint);
  assert.throws(() => validatePreviewSelection(previewId, { ...value, setupScript: "echo changed" }, root), /alterada/);
  writeFileSync(join(dir, "preview.json"), JSON.stringify({ ...preview, recipe: { ...value, image: "python:3.13-slim" } }));
  assert.throws(() => readRepositoryPreview(previewId, root), /inválido/);
});


test("recipe threshold is optional, bounded and survives portable export", () => {
  assert.equal(validateRepositoryRecipe(recipe(), {}).threshold, undefined);
  for (const threshold of [0, 0.8, 1]) {
    const value = validateRepositoryRecipe({ ...recipe(), threshold }, {});
    assert.equal(exportRepositoryRecipe(value).recipe.threshold, threshold);
  }
  for (const threshold of [-1, 1.1, NaN, "0.8", null, true]) {
    assert.throws(() => validateRepositoryRecipe({ ...recipe(), threshold }, {}), /limiar/);
  }
});

test("candidate budget is optional, portable and invalidates prepared recipe identity", () => {
  const legacy = validateRepositoryRecipe(recipe(), {});
  assert.equal(legacy.agentTimeoutSec, undefined);
  const extended = validateRepositoryRecipe({ ...recipe(), agentTimeoutSec: 72 * 3600 }, {});
  assert.equal(exportRepositoryRecipe(extended).recipe.agentTimeoutSec, 259200);
  assert.notEqual(recipeFingerprint(legacy), recipeFingerprint(extended));
  for (const agentTimeoutSec of [0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 1.5, "3600", null]) {
    assert.throws(() => validateRepositoryRecipe({ ...recipe(), agentTimeoutSec }, {}), /Prazo do agente/);
  }
});
