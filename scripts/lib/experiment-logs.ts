// Durable, redacted output captured before Harbor creates its own job.log.
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { experimentDirectory } from "./experiment-store.ts";
import { assertSafeId } from "./registry-validation.ts";
import { assertNoSymlinkPath, safeJoinUnderDir } from "./paths.ts";
import { tailTextFile } from "./joblogs.ts";

function resolveLogPath(jobsDir: string, experimentId: string, candidateId: string, createDir: boolean): string | null {
  assertSafeId(candidateId);
  const root = experimentDirectory(jobsDir, experimentId);
  const logsDir = join(root, "logs");
  assertNoSymlinkPath(logsDir, root);
  if (createDir) mkdirSync(logsDir, { recursive: true });
  else if (!existsSync(logsDir)) return null;
  assertNoSymlinkPath(logsDir, root);
  const path = safeJoinUnderDir(logsDir, `${candidateId}.log`);
  if (!path) throw new Error("caminho de log de candidato inválido");
  return path;
}

function redactChunk(text: string, values: string[]): string {
  return [...new Set(values.filter(Boolean).flatMap(value => [value, JSON.stringify(value).slice(1, -1)]))]
    .sort((a, b) => b.length - a.length)
    .reduce((safe, value) => safe.split(value).join("[REDACTED]"), text);
}

export interface CandidateLogWriter {
  readonly path: string;
  write(stream: "stdout" | "stderr", text: string): void;
  close(): void;
}

/** Creates the candidate log before spawning Harbor, so early diagnostics have a stable target. */
export function openCandidateLog(jobsDir: string, experimentId: string, candidateId: string, redactValues: string[] = []): CandidateLogWriter {
  const path = resolveLogPath(jobsDir, experimentId, candidateId, true)!;
  writeFileSync(path, "", { flag: "wx" });
  let previousStream: "stdout" | "stderr" | undefined;
  return {
    path,
    write(stream, text) {
      if (text) {
        const prefix = stream === previousStream ? "" : `${previousStream ? "\n" : ""}[${stream}] `;
        appendFileSync(path, prefix + redactChunk(text, redactValues));
        previousStream = stream;
      }
    },
    close() { /* each append is synchronous; kept as a lifecycle seam for callers */ },
  };
}

export interface CandidateLogTail { content: string; nextOffset: number; size: number; truncated: boolean }

/** Reads the persisted stream with byte offsets, matching the live Harbor log contract. */
export function readCandidateLog(jobsDir: string, experimentId: string, candidateId: string, offset = 0): CandidateLogTail | null {
  const path = resolveLogPath(jobsDir, experimentId, candidateId, false);
  if (!path || !existsSync(path)) return null;
  return tailTextFile(path, offset, {});
}
