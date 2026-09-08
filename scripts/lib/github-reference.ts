import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { repositoryGit, repositoryProcessEnv, resolveRepositoryCommit, snapshotRepositoryTree } from "./repository-source.ts";
import { assertSafeExport } from "./export-safety.ts";

export interface GithubReferenceInput { repository: string; prNumber: number; baseSha?: string }
export interface PullRequestEvidence { mergedAt: string; mergeSha: string; headSha: string; commitShas: string[] }
export interface HistoricalRange { baseSha: string; finalSha: string; headSha: string; mergeMethod: "merge" | "squash" | "rebase"; diff: string }
export interface GithubReference extends HistoricalRange { baseRoot: string; referenceRoot: string; repository: string; prNumber: number; mergedAt: string }
const SHA = /^[a-f0-9]{40,64}$/;

export function normalizeGithubRepository(value: string): string {
  if (value.startsWith("https://github.com/")) value = value.slice("https://github.com/".length).replace(/\.git$/, "");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value) || value.split("/").some(part => [".", ".."].includes(part))) throw new Error("Informe owner/repo do GitHub, sem credenciais ou parâmetros.");
  return value;
}

function parents(repo: string, sha: string): string[] {
  return repositoryGit(repo, ["rev-list", "--parents", "-n", "1", sha]).toString("utf8").trim().split(" ").slice(1);
}

function diff(repo: string, base: string, final: string): string {
  const value = repositoryGit(repo, ["diff", "--no-ext-diff", "--no-textconv", "--binary", "--full-index", "--no-renames", base, final, "--"], 16 * 1024 * 1024).toString("utf8");
  if (!value.trim()) throw new Error("PR não contém um diff avaliável.");
  assertSafeExport(value);
  return value;
}

function patchId(repo: string, base: string, final: string): string {
  const content = diff(repo, base, final);
  try {
    return execFileSync("git", ["patch-id", "--stable"], { input: content, encoding: "utf8", env: repositoryProcessEnv(), timeout: 30000, maxBuffer: 1024, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }).trim().split(" ")[0];
  } catch { throw new Error("Não foi possível provar o intervalo histórico do PR."); }
}

/** Resolve historical trees from immutable commits, never the current branch HEAD.
 * One-parent merges are not guessed: squash requires aggregate patch equivalence;
 * rebase requires an explicit base and one-to-one ordered patch evidence.
 */
export function resolveHistoricalRange(repo: string, evidence: PullRequestEvidence, explicitBase?: string): HistoricalRange {
  if (!evidence.mergedAt || !SHA.test(evidence.mergeSha) || !SHA.test(evidence.headSha) || !evidence.commitShas.length || evidence.commitShas.some(sha => !SHA.test(sha))) throw new Error("PR precisa estar mergeado e ter evidências completas dos commits.");
  const finalSha = resolveRepositoryCommit(repo, evidence.mergeSha), headSha = resolveRepositoryCommit(repo, evidence.headSha);
  const finalParents = parents(repo, finalSha);
  if (!finalParents.length || finalParents.length > 2) throw new Error("Topologia histórica do PR não suportada.");
  if (finalParents.length === 2) {
    const baseSha = finalParents[0];
    if (explicitBase && explicitBase !== baseSha) throw new Error("SHA inicial diverge do primeiro pai do merge.");
    if (finalParents[1] !== headSha) throw new Error("Merge não corresponde ao head original do PR.");
    return { baseSha, finalSha, headSha, mergeMethod: "merge", diff: diff(repo, baseSha, finalSha) };
  }
  const immediateBase = finalParents[0];
  const originalBase = repositoryGit(repo, ["merge-base", immediateBase, headSha]).toString("utf8").trim();
  if (originalBase !== headSha && patchId(repo, originalBase, headSha) === patchId(repo, immediateBase, finalSha)) {
    if (explicitBase && explicitBase !== immediateBase) throw new Error("SHA inicial diverge do pai do squash comprovado.");
    return { baseSha: immediateBase, finalSha, headSha, mergeMethod: "squash", diff: diff(repo, immediateBase, finalSha) };
  }
  if (!explicitBase || !SHA.test(explicitBase)) throw new Error("Rebase ou merge ambíguo: informe SHA inicial completo. O intervalo será validado pelos patches de todos os commits do PR.");
  const baseSha = resolveRepositoryCommit(repo, explicitBase);
  repositoryGit(repo, ["merge-base", "--is-ancestor", baseSha, finalSha]);
  const integrated = repositoryGit(repo, ["rev-list", "--first-parent", "--reverse", `${baseSha}..${finalSha}`]).toString("utf8").trim().split("\n");
  if (integrated.length !== evidence.commitShas.length) throw new Error("SHA inicial não delimita a quantidade de commits do PR.");
  for (let i = 0; i < integrated.length; i++) {
    const original = evidence.commitShas[i], originalParents = parents(repo, original), integratedParents = parents(repo, integrated[i]);
    if (originalParents.length !== 1 || integratedParents.length !== 1 || patchId(repo, originalParents[0], original) !== patchId(repo, integratedParents[0], integrated[i])) throw new Error("Intervalo rebase não comprovado: commits diferem ou contêm merges intermediários.");
  }
  return { baseSha, finalSha, headSha, mergeMethod: "rebase", diff: diff(repo, baseSha, finalSha) };
}

function githubJson(endpoint: string): any {
  try {
    return JSON.parse(execFileSync("gh", ["api", "--hostname", "github.com", "-H", "Accept: application/vnd.github+json", endpoint], {
      env: repositoryProcessEnv(), timeout: 30000, maxBuffer: 4 * 1024 * 1024, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    }));
  } catch { throw new Error("GitHub não respondeu. Confirme gh instalado, login local e permissão de leitura do PR."); }
}

export function resolveGithubReference(input: GithubReferenceInput, workspace: string): GithubReference {
  const repository = normalizeGithubRepository(input.repository);
  if (!Number.isSafeInteger(input.prNumber) || input.prNumber < 1) throw new Error("Número do PR inválido.");
  const pr = githubJson(`repos/${repository}/pulls/${input.prNumber}`);
  if (!pr.merged || !pr.merged_at || !SHA.test(pr.merge_commit_sha) || !SHA.test(pr.head?.sha)) throw new Error("Selecione um PR já mergeado com commits acessíveis.");
  if (!Number.isSafeInteger(pr.commits) || pr.commits < 1 || pr.commits > 250) throw new Error("PR excede 250 commits; não é seguro usar uma lista truncada.");
  const commitShas: string[] = [];
  for (let page = 1; commitShas.length < pr.commits; page++) {
    const commits = githubJson(`repos/${repository}/pulls/${input.prNumber}/commits?per_page=100&page=${page}`);
    if (!Array.isArray(commits) || !commits.length) throw new Error("GitHub retornou evidências incompletas do PR.");
    commitShas.push(...commits.map(commit => commit.sha));
  }
  if (commitShas.length !== pr.commits || new Set(commitShas).size !== commitShas.length) throw new Error("Lista de commits incompleta ou inconsistente.");
  const mirror = join(workspace, "source.git"), baseRoot = join(workspace, "base"), referenceRoot = join(workspace, "reference");
  if ([mirror, baseRoot, referenceRoot].some(existsSync)) throw new Error("Workspace histórico deve estar vazio.");
  mkdirSync(workspace, { recursive: true });
  repositoryGit(undefined, ["clone", "--mirror", "--", `https://github.com/${repository}.git`, mirror]);
  repositoryGit(mirror, ["fetch", "--no-tags", "origin", `refs/pull/${input.prNumber}/head`]);
  const evidence = { mergedAt: pr.merged_at, mergeSha: pr.merge_commit_sha, headSha: pr.head.sha, commitShas };
  const range = resolveHistoricalRange(mirror, evidence, input.baseSha);
  snapshotRepositoryTree(mirror, range.baseSha, baseRoot);
  snapshotRepositoryTree(mirror, range.finalSha, referenceRoot);
  return { ...range, baseRoot, referenceRoot, repository, prNumber: input.prNumber, mergedAt: pr.merged_at };
}
