// State directory and path safety. Foundational: several modules build paths under the state
// dir, and anything whose path segment can arrive over HTTP must go through
// safeJoinUnderDir before touching disk.

import { join, relative, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";

export function getStateDir(): string {
  return process.env.HARBOR_EVAL_STATE_DIR || join(homedir(), ".harbor-eval-kit");
}

export function newId(): string {
  return randomUUID();
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
