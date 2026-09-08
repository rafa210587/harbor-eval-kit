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

// Harbor's useful textual artifacts have stable names. Keep arbitrary configuration and
// credential files out of the read surface even when a caller supplies a custom jobs dir.
const KNOWN_TEXT_LOG = /^(?:agent-)?(?:stdout|stderr|test-stdout|test-output|reward|exception)(?:\.txt)?$/i;
function isLogFileName(name: string, relativePath = name): boolean {
  const normalized = relativePath.replaceAll("\\", "/");
  return name.toLowerCase().endsWith(".log") || KNOWN_TEXT_LOG.test(name)
    || /(?:^|\/)agent\/[^/]+\.txt$/i.test(normalized);
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
  for (const entry of readdirSync(jobsDir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith("."))) {
    const dir = join(jobsDir, entry.name);
    let mtimeMs = 0;
    try {
      const files = listJobLogFiles(jobsDir, entry.name);
      for (const file of files) {
        try { mtimeMs = Math.max(mtimeMs, statSync(join(dir, file)).mtimeMs); } catch { /* rotated */ }
      }
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
      if (e.isSymbolicLink()) continue;
      const abs = join(dir, e.name);
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walk(abs, rel, depth + 1);
      else if (e.isFile() && isLogFileName(e.name, rel)) {
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

function completeUtf8End(buffer: Buffer, start: number, end: number): number {
  if (end <= start) return end;
  let lead = end - 1;
  while (lead >= start && (buffer[lead] & 0xc0) === 0x80) lead--;
  if (lead < start) return start;
  const byte = buffer[lead];
  const expected = byte < 0x80 ? 1 : byte >= 0xc2 && byte <= 0xdf ? 2
    : byte >= 0xe0 && byte <= 0xef ? 3 : byte >= 0xf0 && byte <= 0xf4 ? 4 : 1;
  return end - lead < expected ? lead : end;
}

/** Incremental byte-offset tail for trusted text paths. Never advances past partial UTF-8. */
export function tailTextFile(target: string, offset: number, secrets: Record<string, string> = {}, maxBytes = 200_000): LogTail | null {
  if (!existsSync(target)) return null;
  let info;
  try { info = statSync(target); } catch { return null; }
  if (!info.isFile()) return null;
  const size = info.size;
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("offset do log deve ser inteiro não negativo");
  let start = offset > size ? 0 : offset;
  let truncated = false;
  if (size - start > maxBytes) { start = size - maxBytes; truncated = true; }
  const fd = openSync(target, "r");
  try {
    const values = [...new Set(Object.values(secrets).filter(Boolean).flatMap(value => [value, JSON.stringify(value).slice(1, -1)]))].map(value => Buffer.from(value));
    const overlap = Math.max(0, ...values.map(value => value.length - 1));
    const contextStart = Math.max(0, start - overlap);
    const length = size - contextStart;
    if (length <= 0) return { content: "", nextOffset: size, size, truncated: false };
    const buf = Buffer.alloc(length);
    const read = readSync(fd, buf, 0, length, contextStart);
    const source = buf.subarray(0, read), safe = Buffer.from(source);
    let end = read;
    for (const value of values) {
      let match = source.indexOf(value);
      while (match !== -1) { safe.fill(42, match, match + value.length); match = source.indexOf(value, match + 1); }
      for (let n = Math.min(value.length - 1, read); n > 0; n--) {
        if (source.subarray(read - n).equals(value.subarray(0, n))) { end = Math.min(end, read - n); break; }
      }
    }
    let contentStart = start - contextStart;
    while (contentStart < end && (safe[contentStart] & 0xc0) === 0x80) contentStart++;
    end = completeUtf8End(safe, contentStart, Math.max(contentStart, end));
    return { content: safe.subarray(contentStart, end).toString("utf-8"), nextOffset: contextStart + end, size, truncated };
  } finally { closeSync(fd); }
}

/**
 * Reads a log file from `offset` to EOF. Both path segments are guarded with
 * safeJoinUnderDir, so a crafted `job`/`file` can never escape the jobs dir. A file that
 * shrank since the last poll (harbor rewrote it) resets the offset to 0 instead of returning
 * garbage.
 */
export function tailJobLog(jobsDir: string, job: string, file: string, offset: number, secrets: Record<string, string> = {}): LogTail | null {
  const jobDir = safeJoinUnderDir(jobsDir, job);
  if (!jobDir) return null;
  const fileName = file.split(/[\\/]/).at(-1) ?? "";
  if (!isLogFileName(fileName, file)) return null;
  const target = safeJoinUnderDir(jobDir, file);
  if (!target || !existsSync(target)) return null;
  return tailTextFile(target, offset, secrets);
}
