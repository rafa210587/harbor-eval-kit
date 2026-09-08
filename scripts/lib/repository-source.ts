import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { assertSafeExport } from "./export-safety.ts";

export interface RepositorySource { kind: "local" | "git"; location: string; ref?: string; includeWorkingTree?: boolean }
export interface RepositoryFile { path: string; sha256: string; size: number }
export interface RepositorySnapshot { root: string; revision: string | null; files: RepositoryFile[]; source: RepositorySource }
const MAX_FILES = 20000, MAX_FILE = 16 * 1024 * 1024, MAX_TOTAL = 256 * 1024 * 1024;
const privatePath = /(?:^|\/)(?:\.git|\.env(?:\.(?!(?:example|template)$).*)?|secrets\.env|credentials(?:\.json)?|id_(?:rsa|ed25519|ecdsa)|\.ssh|\.aws|\.claude\.json)(?:\/|$)|\.(?:pem|pfx|p12)$/i;

export function safeRepositoryPath(path: string): string {
  if (!path || path.includes("\\") || path.includes(":" ) || isAbsolute(path) || path.split("/").some(p => !p || p === "." || p === "..") || /[\x00-\x1f]/.test(path) || privatePath.test(path)) {
    throw new Error("Caminho de repositório inválido ou sensível.");
  }
  return path;
}

/** Only Git/SSH identity discovery reaches Git. Application/provider secrets never do. */
export function repositoryProcessEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "Path", "HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "SYSTEMROOT", "SystemRoot", "WINDIR", "TEMP", "TMP", "TMPDIR", "SSH_AUTH_SOCK", "APPDATA", "LOCALAPPDATA"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return { ...env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null", GIT_TERMINAL_PROMPT: "0", GIT_LFS_SKIP_SMUDGE: "1", GIT_OPTIONAL_LOCKS: "0", GIT_NO_REPLACE_OBJECTS: "1" };
}

/** No shell, no hooks/checkout/filters and no untrusted stderr in API responses. */
export function repositoryGit(repo: string | undefined, args: string[], maxBuffer = MAX_TOTAL): Buffer {
  try {
    return execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", "-c", "protocol.ext.allow=never", "-c", "credential.helper=", "-c", "credential.https://github.com.helper=!gh auth git-credential", ...(repo ? ["-C", repo] : []), ...args], {
      env: repositoryProcessEnv(), timeout: 120000, maxBuffer, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
    });
  } catch { throw new Error("Git não conseguiu ler a fonte. Verifique endereço, referência e autenticação local (gh/SSH), sem inserir credenciais na URL."); }
}

export function validateRepositoryRemote(location: string): string {
  if (/[\s\x00-\x1f]/.test(location) || location.startsWith("-")) throw new Error("Endereço Git inválido.");
  if (/^git@[A-Za-z0-9.-]+:[A-Za-z0-9_./-]+(?:\.git)?$/.test(location)) return location;
  let url: URL;
  try { url = new URL(location); } catch { throw new Error("Use URL Git HTTPS/SSH ou um caminho local."); }
  if (!["https:", "ssh:"].includes(url.protocol) || url.password || url.search || url.hash || (url.username && !(url.protocol === "ssh:" && url.username === "git"))) throw new Error("URL Git não pode conter credenciais, query ou fragmento.");
  if (!url.hostname || url.pathname === "/") throw new Error("Informe o caminho do repositório remoto.");
  return location;
}

export function resolveRepositoryCommit(repo: string, ref = "HEAD"): string {
  if (!/^[A-Za-z0-9_./-]+$/.test(ref) || ref.startsWith("-") || ref.includes("..")) throw new Error("Referência Git inválida.");
  const sha = repositoryGit(repo, ["rev-parse", "--verify", `${ref}^{commit}`]).toString("utf8").trim();
  if (!/^[a-f0-9]{40,64}$/.test(sha)) throw new Error("Git retornou uma revisão inválida.");
  return sha;
}

export function snapshotRepositoryTree(repo: string, sha: string, destination: string): RepositoryFile[] {
  sha = resolveRepositoryCommit(repo, sha);
  const entries = repositoryGit(repo, ["ls-tree", "-rz", "--full-tree", sha]).toString("utf8").split("\0").filter(Boolean);
  if (entries.length > MAX_FILES) throw new Error("Repositório excede 20.000 arquivos.");
  const files: RepositoryFile[] = [];
  let total = 0;
  // Validate the entire tree before writing; submodules and symlinks cannot escape isolation.
  const parsed = entries.map(entry => {
    const match = entry.match(/^(100644|100755) blob ([a-f0-9]{40,64})\t([\s\S]+)$/);
    if (!match) throw new Error("Snapshot não aceita links simbólicos ou submódulos. Materialize arquivos seguros explicitamente.");
    return { mode: match[1], sha: match[2], path: safeRepositoryPath(match[3]) };
  });
  for (const entry of parsed) {
    const size = Number(repositoryGit(repo, ["cat-file", "-s", entry.sha]).toString("utf8").trim());
    if (!Number.isSafeInteger(size) || size > MAX_FILE || (total += size) > MAX_TOTAL) throw new Error("Snapshot excede os limites de tamanho (16 MiB/arquivo; 256 MiB total).");
    const content = repositoryGit(repo, ["cat-file", "blob", entry.sha], MAX_FILE + 1);
    assertSafeExport(content.toString("utf8"));
    const target = join(destination, entry.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, { mode: entry.mode === "100755" ? 0o755 : 0o644, flag: "wx" });
    files.push({ path: entry.path, size: content.length, sha256: createHash("sha256").update(content).digest("hex") });
  }
  mkdirSync(destination, { recursive: true });
  return files;
}

function snapshotDirectory(source: string, destination: string): RepositoryFile[] {
  const root = realpathSync.native(source), files: RepositoryFile[] = [];
  let total = 0;
  const visit = (dir: string, prefix = "", depth = 0) => {
    if (depth > 64) throw new Error("Diretório excede a profundidade permitida.");
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const path = safeRepositoryPath(prefix + entry.name), absolute = join(dir, entry.name);
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error("Snapshot não aceita links simbólicos ou arquivos especiais.");
      if (stat.isDirectory()) { visit(absolute, `${path}/`, depth + 1); continue; }
      if (files.length >= MAX_FILES || stat.size > MAX_FILE || (total += stat.size) > MAX_TOTAL) throw new Error("Diretório excede os limites de snapshot.");
      const content = readFileSync(absolute);
      assertSafeExport(content.toString("utf8"));
      const target = join(destination, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content, { flag: "wx", mode: stat.mode & 0o777 });
      files.push({ path, size: content.length, sha256: createHash("sha256").update(content).digest("hex") });
    }
  };
  visit(root);
  mkdirSync(destination, { recursive: true });
  return files;
}

/** Native resolution expands Windows 8.3 aliases as well as macOS temp roots. */
function canonicalDestination(path: string): string {
  if (existsSync(path)) return realpathSync.native(path);
  const parent = dirname(path);
  return parent === path ? path : join(canonicalDestination(parent), relative(parent, path));
}

export function prepareRepositorySource(source: RepositorySource, destination: string): RepositorySnapshot {
  if (!source || !["local", "git"].includes(source.kind) || typeof source.location !== "string" || !source.location.trim()) throw new Error("Informe a fonte do repositório.");
  if (source.includeWorkingTree !== undefined && typeof source.includeWorkingTree !== "boolean") throw new Error("Seleção de alterações locais deve ser booleana.");
  if (existsSync(destination)) throw new Error("O destino do snapshot deve ser novo.");
  if (source.kind === "git") {
    const remote = validateRepositoryRemote(source.location), mirror = `${destination}.git-source`;
    if (existsSync(mirror)) throw new Error("Destino de aquisição já existe.");
    repositoryGit(undefined, ["clone", "--mirror", "--", remote, mirror]);
    const revision = resolveRepositoryCommit(mirror, source.ref);
    return { root: resolve(destination), revision, files: snapshotRepositoryTree(mirror, revision, destination), source: { ...source, location: remote } };
  }
  const root = resolve(source.location);
  if (!existsSync(root) || !lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) throw new Error("Fonte local deve ser um diretório real.");
  const rel = relative(realpathSync.native(root), canonicalDestination(resolve(destination)));
  if (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)) throw new Error("Snapshot não pode ser criado dentro da fonte.");
  let revision: string | null = null;
  if (!source.includeWorkingTree) {
    try {
      // A plain folder nested under an unrelated checkout is still only that folder.
      const top = repositoryGit(root, ["rev-parse", "--show-toplevel"]).toString("utf8").trim();
      if (relative(realpathSync.native(top), realpathSync.native(root)) === "") revision = resolveRepositoryCommit(root, source.ref);
      else if (source.ref) throw new Error("A referência exige a raiz do repositório Git.");
    }
    catch (error) { if (source.ref || existsSync(join(root, ".git"))) throw error; }
  }
  return { root: resolve(destination), revision, files: revision ? snapshotRepositoryTree(root, revision, destination) : snapshotDirectory(root, destination), source: { ...source, location: root } };
}
