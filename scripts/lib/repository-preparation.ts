import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getStateDir, safeJoinUnderDir } from "./paths.ts";
import { setTaskRubricDefault } from "./tasks.ts";
import { assertSafeId } from "./registry-validation.ts";
import { prepareRepositorySource, type RepositoryFile } from "./repository-source.ts";
import { resolveGithubReference } from "./github-reference.ts";
import { resolveSpecBundle } from "./spec-bundle.ts";
import { validateRepositoryRecipe, recipeFingerprint, type RepositoryRecipe } from "./repository-recipes.ts";
import { repositoryTreeManifest } from "./repository-integrity.ts";
import { assertSafeExport } from "./export-safety.ts";

export function repositoryPreviewDirectory(id: string, stateDir = getStateDir()) {
  assertSafeId(id);
  const path = safeJoinUnderDir(stateDir, `repository-previews/${id}`);
  if (!path) throw new Error("preview atravessa link simbólico");
  return path;
}
export interface RepositoryPreview {
  previewId: string; recipe: RepositoryRecipe; fingerprint: string;
  baseRoot: string; referenceRoot: string; documents: { path: string; content: string; sha256: string; size: number }[];
  manifest: { repository: string; prNumber: number; baseSha: string; finalSha: string; headSha: string;
    mergeMethod: string; mergedAt: string; codeFiles: RepositoryFile[]; referenceFiles: RepositoryFile[]; documentFiles: { path: string; sha256: string }[];
    referenceDiffSha256: string };
  warnings: string[]; blockers: string[];
}
export function resolveRepositoryRecipe(input: unknown, stateDir = getStateDir()): RepositoryPreview {
  const recipe = validateRepositoryRecipe(input);
  const previewId = randomUUID(), root = repositoryPreviewDirectory(previewId, stateDir);
  mkdirSync(root, { recursive: true });
  const reference = resolveGithubReference(recipe.reference, join(root, "history"));
  const isGitSource = recipe.codeSource.kind === "git" || existsSync(join(recipe.codeSource.location, ".git"));
  const codeSource = { ...recipe.codeSource, ...(isGitSource && !recipe.codeSource.ref ? { ref: reference.baseSha } : {}) };
  const code = prepareRepositorySource(codeSource, join(root, "code"));
  const referenceBase = prepareRepositorySource({ kind: "local", location: reference.baseRoot }, join(root, "verified-base"));
  const digest = (files: RepositoryFile[]) => JSON.stringify(files.map(f => [f.path, f.sha256]).sort((a,b) => a[0].localeCompare(b[0])));
  if (digest(code.files) !== digest(referenceBase.files)) throw new Error("fonte de código não corresponde à base histórica do PR; selecione a revisão inicial correta");
  const documentSource = recipe.documentSource ? prepareRepositorySource(recipe.documentSource, join(root, "documents-source")) : code;
  const documents = resolveSpecBundle(documentSource.root, recipe.specPaths[0], recipe.specPaths.slice(1));
  assertSafeExport(reference.diff);
  writeFileSync(join(root, "reference.diff"), reference.diff, { flag: "wx", mode: 0o600 });
  const manifest = {
    repository: reference.repository, prNumber: reference.prNumber, baseSha: reference.baseSha, finalSha: reference.finalSha,
    headSha: reference.headSha, mergeMethod: reference.mergeMethod, mergedAt: reference.mergedAt,
    codeFiles: code.files, referenceFiles: repositoryTreeManifest(reference.referenceRoot), documentFiles: documents.documents.map(({ path, sha256 }) => ({ path, sha256 })),
    referenceDiffSha256: createHash("sha256").update(reference.diff).digest("hex"),
  };
  const preview: RepositoryPreview = { previewId, recipe, fingerprint: recipeFingerprint(recipe), baseRoot: code.root,
    referenceRoot: reference.referenceRoot, documents: documents.documents, manifest,
    warnings: ["Código do PR nunca é entregue ao candidato. Confira se os documentos não contêm a solução.",
      ...documents.suggestedPaths.map(path => `Documento referenciado não selecionado: ${path}`)], blockers: [] };
  assertSafeExport(preview);
  writeFileSync(join(root, "preview.json"), JSON.stringify(preview, null, 2), { flag: "wx", mode: 0o600 });
  return preview;
}
export function readRepositoryPreview(id: string, stateDir = getStateDir()): RepositoryPreview {
  const preview = JSON.parse(readFileSync(join(repositoryPreviewDirectory(id, stateDir), "preview.json"), "utf8"));
  if (preview.previewId !== id || preview.fingerprint !== recipeFingerprint(validateRepositoryRecipe(preview.recipe))) throw new Error("preview inválido; resolva novamente a receita");
  return preview;
}
export function validatePreviewSelection(previewId: string, recipe: unknown, stateDir = getStateDir()) {
  const preview = readRepositoryPreview(previewId, stateDir);
  if (recipeFingerprint(validateRepositoryRecipe(recipe)) !== preview.fingerprint) throw new Error("receita alterada após preview; resolva novamente antes de preparar");
  return preview;
}
export function preparedRepositoryTaskPath(previewId: string) {
  assertSafeId(previewId);
  return resolve("evals", "repositories", `repo-${previewId.slice(0, 12)}`);
}
export function pinPreparedRepositoryTask(path: string, recipe: RepositoryRecipe) {
  if (recipe.judgeId || recipe.rubricIds) setTaskRubricDefault(path, { judgeId: recipe.judgeId, rubricIds: recipe.rubricIds });
}
