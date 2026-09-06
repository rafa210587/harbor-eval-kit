// Live tail of the log files harbor writes into the jobs dir. Execution state is read from
// disk (result.json) rather than from this server memory, so it also covers runs started by
// the CLI and survives a gui-server restart. See docs/ENGENHARIA.md §7.

import { existsSync, readdirSync, readFileSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { join } from "node:path";
import { safeJoinUnderDir } from "./paths.ts";

// ---------- Job logs ----------

export interface JobLogListing {
  /** Path relative to the jobs dir, usable as the `job` query param of the tail endpoint. */
  name: string;
  /** Epoch ms of the most recently touched log file inside this job dir. */
  mtimeMs: number;
  running: boolean;
}

/**
 * Lists job directories under `jobsDir`, newest first. `running` is read from the job's own
 * result.json (`finished_at: null` while harbor is still working) rather than from any state
 * this server keeps -- so a job started by the CLI, or one still going after a `gui-server`
 * restart, is reported just as accurately as one this process spawned.
 */
export function listJobLogs(jobsDir: string): JobLogListing[] {
  if (!existsSync(jobsDir)) return [];
  const out: JobLogListing[] = [];
  for (const entry of readdirSync(jobsDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const dir = join(jobsDir, entry.name);
    let mtimeMs = 0;
    try {
      mtimeMs = statSync(dir).mtimeMs;
    } catch {
      continue;
    }
    let running = false;
    const resultPath = join(dir, "result.json");
    if (existsSync(resultPath)) {
      try {
        running = JSON.parse(readFileSync(resultPath, "utf-8")).finished_at === null;
      } catch {
        running = false;
      }
    }
    out.push({ name: entry.name, mtimeMs, running });
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/**
 * Every `.log` file inside one job dir (the job's own `job.log` plus each trial's `trial.log`),
 * newest first, as paths relative to the job dir.
 */
export function listJobLogFiles(jobsDir: string, job: string): string[] {
  const jobDir = safeJoinUnderDir(jobsDir, job);
  if (!jobDir || !existsSync(jobDir)) return [];
  const out: { rel: string; mtimeMs: number }[] = [];
  const walk = (dir: string, prefix: string, depth: number): void => {
    if (depth > 3) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name);
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walk(abs, rel, depth + 1);
      else if (e.name.endsWith(".log") || e.name.endsWith(".txt")) {
        try {
          out.push({ rel, mtimeMs: statSync(abs).mtimeMs });
        } catch { /* file vanished mid-scan (harbor rotating artifacts) -- skip it */ }
      }
    }
  };
  walk(jobDir, "", 0);
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs).map((f) => f.rel);
}

export interface LogTail {
  content: string;
  /** Byte offset to pass back as `offset` next poll, so only new bytes cross the wire. */
  nextOffset: number;
  size: number;
  truncated: boolean;
}

/**
 * Reads a log file from `offset` to EOF. Both path segments are guarded with
 * safeJoinUnderDir, so a crafted `job`/`file` can never escape the jobs dir. A file that
 * shrank since the last poll (harbor rewrote it) resets the offset to 0 instead of returning
 * garbage.
 */
export function tailJobLog(jobsDir: string, job: string, file: string, offset: number): LogTail | null {
  const jobDir = safeJoinUnderDir(jobsDir, job);
  if (!jobDir) return null;
  const target = safeJoinUnderDir(jobDir, file);
  if (!target || !existsSync(target)) return null;
  const size = statSync(target).size;
  const MAX_BYTES = 200_000;
  let start = offset > size ? 0 : Math.max(0, offset);
  let truncated = false;
  if (size - start > MAX_BYTES) {
    start = size - MAX_BYTES;
    truncated = true;
  }
  const fd = openSync(target, "r");
  try {
    const length = size - start;
    if (length <= 0) return { content: "", nextOffset: size, size, truncated: false };
    const buf = Buffer.alloc(length);
    readSync(fd, buf, 0, length, start);
    return { content: buf.toString("utf-8"), nextOffset: size, size, truncated };
  } finally {
    closeSync(fd);
  }
}
