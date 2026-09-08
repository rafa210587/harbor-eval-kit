// Portable recipes refer to sources, never to authentication or private snapshots.
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getStateDir, safeJoinUnderDir } from "./paths.ts";
import { assertSafeId } from "./registry-validation.ts";
import { assertSafeExport } from "./export-safety.ts";
import { validateRepositoryRemote, type RepositorySource } from "./repository-source.ts";
import { assertRelativeRepositoryPath, validateSafeVerificationChecks, validateVerificationThreshold, type VerificationCheck } from "./verification-profile.ts";

export interface RepositoryRecipe {
  schemaVersion: 1; id: string; label: string; codeSource: RepositorySource;
  documentSource?: RepositorySource; specPaths: string[];
  reference: { repository: string; prNumber: number; baseSha?: string };
  checks: VerificationCheck[]; threshold?: number; image: string; setupScript: string;
  judgeId?: string; rubricIds?: string[]; trusted: true;
  allowPassingBase?: boolean; passingBaseReason?: string;
}
export function recipeDirectory(id: string, stateDir = getStateDir()) {
  assertSafeId(id);
  const path = safeJoinUnderDir(stateDir, `repository-evals/${id}`);
  if (!path) throw new Error("receita atravessa um link simbólico");
  return path;
}
function source(value: unknown): asserts value is RepositorySource {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("fonte inválida");
  const s = value as RepositorySource;
  if (Object.keys(s).some(k => !["kind", "location", "ref", "includeWorkingTree"].includes(k))
    || !["local", "git"].includes(s.kind) || typeof s.location !== "string" || !s.location.trim()
    || s.location.length > 2048 || /[\x00-\x1f]/.test(s.location)) throw new Error("fonte requer caminho local ou URL Git");
  if (s.kind === "git") validateRepositoryRemote(s.location);
  if (s.ref !== undefined && (typeof s.ref !== "string" || !/^[A-Za-z0-9_./-]{1,200}$/.test(s.ref) || s.ref.startsWith("-") || s.ref.includes(".."))) throw new Error("ref inválida");
  if (s.includeWorkingTree !== undefined && typeof s.includeWorkingTree !== "boolean") throw new Error("includeWorkingTree deve ser boolean");
}
export function validateRepositoryRecipe(input: unknown, secrets?: Record<string, string>): RepositoryRecipe {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("receita inválida");
  const value = input as RepositoryRecipe;
  const allowed = ["schemaVersion", "id", "label", "codeSource", "documentSource", "specPaths", "reference", "checks", "threshold", "image", "setupScript", "judgeId", "rubricIds", "trusted", "allowPassingBase", "passingBaseReason"];
  if (Object.keys(value).some(k => !allowed.includes(k)) || value.schemaVersion !== undefined && value.schemaVersion !== 1) throw new Error("schema de receita não suportado");
  if (value.id !== undefined) assertSafeId(value.id);
  if (typeof value.label !== "string" || !value.label.trim() || value.label.length > 120 || value.trusted !== true) throw new Error("nome e confirmação de repositório confiável são obrigatórios");
  source(value.codeSource);
  if (value.documentSource) source(value.documentSource);
  if (!Array.isArray(value.specPaths) || !value.specPaths.length || value.specPaths.length > 100 || new Set(value.specPaths).size !== value.specPaths.length) throw new Error("selecione de 1 a 100 documentos sem repetições");
  value.specPaths.forEach(path => { assertRelativeRepositoryPath(path); if (!path.toLowerCase().endsWith(".md")) throw new Error("documentos precisam ser Markdown"); });
  const ref = value.reference;
  if (!ref || typeof ref !== "object" || Object.keys(ref).some(k => !["repository", "prNumber", "baseSha"].includes(k))
    || typeof ref.repository !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(ref.repository)
    || !Number.isSafeInteger(ref.prNumber) || ref.prNumber < 1
    || ref.baseSha !== undefined && !/^[a-f0-9]{40,64}$/.test(ref.baseSha)) throw new Error("referência requer owner/repo, número do PR e SHA inicial válido quando informado");
  validateSafeVerificationChecks(value.checks, secrets);
  if (value.threshold !== undefined) validateVerificationThreshold(value.threshold);
  if (typeof value.image !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]{0,240}$/.test(value.image)) throw new Error("imagem inválida; informe imagem Linux com Python 3 e bash");
  if (typeof value.setupScript !== "string" || value.setupScript.length > 32768 || value.setupScript.includes("\0")) throw new Error("script de preparação inválido");
  if (value.judgeId !== undefined) assertSafeId(value.judgeId);
  if (value.rubricIds !== undefined) {
    if (!Array.isArray(value.rubricIds)) throw new Error("rubricas devem ser uma lista");
    value.rubricIds.forEach(assertSafeId);
  }
  if (value.allowPassingBase !== undefined && typeof value.allowPassingBase !== "boolean") throw new Error("exceção da base deve ser boolean");
  if (value.allowPassingBase && (typeof value.passingBaseReason !== "string" || value.passingBaseReason.trim().length < 12)) throw new Error("justifique por que a base pode passar os checks (ex.: mudança documental)");
  if (value.passingBaseReason !== undefined && (typeof value.passingBaseReason !== "string" || value.passingBaseReason.length > 1000)) throw new Error("justificativa inválida");
  assertSafeExport(value, secrets);
  return { ...structuredClone(value), schemaVersion: 1, id: value.id ?? randomUUID(), label: value.label.trim() };
}
export function recipeFingerprint(recipe: RepositoryRecipe) {
  const { id, ...content } = recipe;
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}
export function saveRepositoryRecipe(input: unknown, stateDir = getStateDir()) {
  const recipe = validateRepositoryRecipe(input);
  const dir = recipeDirectory(recipe.id, stateDir); mkdirSync(dir, { recursive: true });
  const temporary = join(dir, `${randomUUID()}.tmp`);
  writeFileSync(temporary, JSON.stringify(recipe, null, 2), { flag: "wx", mode: 0o600 });
  renameSync(temporary, join(dir, "recipe.json"));
  return recipe;
}
export function readRepositoryRecipe(id: string, stateDir = getStateDir()) {
  return validateRepositoryRecipe(JSON.parse(readFileSync(join(recipeDirectory(id, stateDir), "recipe.json"), "utf8")));
}
export function listRepositoryRecipes(stateDir = getStateDir()) {
  const root = safeJoinUnderDir(stateDir, "repository-evals");
  if (!root || !existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory() && !e.isSymbolicLink() && existsSync(join(root, e.name, "recipe.json"))).map(e => readRepositoryRecipe(e.name, stateDir));
}
export function exportRepositoryRecipe(recipe: RepositoryRecipe) {
  const portable = structuredClone(recipe);
  const requiredLocalSources: string[] = [];
  for (const name of ["codeSource", "documentSource"] as const) {
    if (portable[name]?.kind === "local") {
      portable[name]!.location = `LOCAL_SOURCE_${name}`;
      requiredLocalSources.push(name);
    }
  }
  const bundle = { format: "harbor-eval-kit-repository-recipe", version: 1, recipe: portable, requiredLocalSources };
  assertSafeExport(bundle); return bundle;
}
export function previewRepositoryRecipeImport(input: any, stateDir = getStateDir()) {
  if (!input || input.format !== "harbor-eval-kit-repository-recipe" || input.version !== 1
    || Object.keys(input).some(k => !["format", "version", "recipe", "requiredLocalSources"].includes(k))) throw new Error("envelope de receita não suportado");
  const recipe = validateRepositoryRecipe(input.recipe);
  const existing = listRepositoryRecipes(stateDir).find(item => item.id === recipe.id);
  const conflicts = existing && recipeFingerprint(existing) !== recipeFingerprint(recipe) ? [{ id: recipe.id, label: existing.label }] : [];
  return { recipe, warnings: ["Revise/remapeie fontes locais e vincule credenciais nesta máquina antes de resolver. O preview não grava dados.",
    ...(conflicts.length ? ["Já existe uma receita diferente com este ID. Salvar substituirá essa receita local; resolva novamente a prévia antes de executar."] : [])], conflicts };
}
