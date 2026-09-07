// State directory and path safety. Foundational: several modules build paths under the state
// dir, and anything whose path segment can arrive over HTTP must go through
// safeJoinUnderDir before touching disk.

import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, dirname, relative, isAbsolute, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";

import type { RegistryName } from "./types.ts";

export function getStateDir(): string {
  return process.env.HARBOR_EVAL_STATE_DIR || join(homedir(), ".harbor-eval-kit");
}

export function newId(): string {
  return randomUUID();
}

// ---------- registries (agents/models/skills/skillsets/criteria/rubrics/judges) ----------

export function getRegistryPath(name: RegistryName): string {
  if (!["agents", "models", "skills", "skillsets", "criteria", "rubrics", "judges"].includes(name)) throw new Error("registro desconhecido");
  return managedPath("registries", `${name}.json`);
}

/**
 * Reads a registry. "File does not exist yet" is a normal empty state; "file exists but is not
 * valid JSON" is NOT, and throws instead of degrading to [].
 *
 * The old `catch { return [] }` was a silent data-loss path, not just a cosmetic one: a
 * corrupted agents.json read as empty, the GUI showed zero agents, and the very next "add
 * agent" wrote a one-item array over the file -- permanently discarding every entry that was
 * still sitting there in the broken-but-recoverable original. Failing loudly keeps the bad
 * file on disk where it can be repaired or restored from a config bundle.
 */
export function readRegistry<T>(name: RegistryName): T[] {
  const p = getRegistryPath(name);
  if (!existsSync(p)) return [];
  const raw = readFileSync(p, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `registro '${name}' está corrompido (${p}): ${(err as Error).message}. ` +
        `O arquivo NÃO foi sobrescrito -- corrija o JSON à mão ou reimporte um config bundle.`
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`registro '${name}' não é uma lista JSON (${p}) -- o arquivo não foi sobrescrito.`);
  }
  return parsed as T[];
}

/**
 * Writes a registry atomically: full contents to a temp file in the same directory, then
 * rename over the target. rename(2) is atomic within a filesystem on every platform this kit
 * supports, so a crash mid-write leaves either the old file or the new one -- never the
 * half-written file that readRegistry would then refuse to parse.
 */
export function writeRegistry<T>(name: RegistryName, items: T[]): void {
  const p = getRegistryPath(name);
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.${randomUUID()}.tmp`;
  writeFileSync(tmp, JSON.stringify(items, null, 2), { flag: "wx" });
  renameSync(tmp, p);
}

/** Joins `relativeName` onto `dir`, refusing anything that would resolve outside `dir`
 *  (`..` segments, absolute paths) -- extra-file names come from the GUI/API body, not a
 *  trusted source, and this only ever runs against the local filesystem. */
export function safeJoinUnderDir(dir: string, relativeName: string): string | null {
  if (!relativeName || isAbsolute(relativeName) || /^[\\/]|^[a-z]:/i.test(relativeName) || /[\x00-\x1f:]/.test(relativeName)) return null;
  if (relativeName.split(/[\\/]/).some(p => p === ".." || p === "." || !p)) return null;
  const target = join(dir, relativeName);
  const rel = relative(dir, target);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  try { assertNoSymlinkPath(target, dir); } catch { return null; }
  return target;
}

/** Refuse links/junctions at the trusted boundary and beneath it, including dangling links.
 * Ancestors above the boundary belong to host configuration (e.g. macOS /var -> /private/var).
 */
export function assertNoSymlinkPath(path: string, boundary: string): void {
  const absolute = resolve(path);
  let current = resolve(boundary);
  const rel = relative(current, absolute);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error("caminho fora do diretório gerenciado");
  for (const part of ["", ...rel.split(sep).filter(Boolean)]) {
    if (part) current = join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) throw new Error("caminho gerenciado contém link simbólico ou junction");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
  }
}

export function managedPath(...segments: string[]): string {
  const path = safeJoinUnderDir(getStateDir(), segments.join("/"));
  if (!path) throw new Error("caminho gerenciado inválido ou contém link simbólico");
  return path;
}
