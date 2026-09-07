// State directory and path safety. Foundational: several modules build paths under the state
// dir, and anything whose path segment can arrive over HTTP must go through
// safeJoinUnderDir before touching disk.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, dirname, relative, isAbsolute } from "node:path";
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
  return join(getStateDir(), "registries", `${name}.json`);
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
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(items, null, 2));
  renameSync(tmp, p);
}

/** Joins `relativeName` onto `dir`, refusing anything that would resolve outside `dir`
 *  (`..` segments, absolute paths) -- extra-file names come from the GUI/API body, not a
 *  trusted source, and this only ever runs against the local filesystem. */
export function safeJoinUnderDir(dir: string, relativeName: string): string | null {
  const target = join(dir, relativeName);
  const rel = relative(dir, target);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return target;
}
