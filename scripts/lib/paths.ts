// State directory and path safety. Foundational: several modules build paths under the state
// dir, and anything whose path segment can arrive over HTTP must go through
// safeJoinUnderDir before touching disk.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

export function readRegistry<T>(name: RegistryName): T[] {
  const p = getRegistryPath(name);
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as T[];
  } catch {
    return [];
  }
}

export function writeRegistry<T>(name: RegistryName, items: T[]): void {
  const p = getRegistryPath(name);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(items, null, 2));
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
