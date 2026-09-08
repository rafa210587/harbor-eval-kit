// Durable, already-redacted progress for long local operations such as Harbor Analyze.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { managedPath, safeJoinUnderDir } from "./paths.ts";
import { tailTextFile, type LogTail } from "./joblogs.ts";

export type OperationStatus = "starting" | "running" | "succeeded" | "failed";
export interface OperationRecord {
  version: 1; id: string; type: "analyze" | "view" | "repository"; status: OperationStatus;
  createdAt: string; updatedAt: string; finishedAt?: string;
  targetPath: string; jobsDir: string; harborJobName?: string;
  artifactPath?: string; error?: string; result?: unknown;
}

export function assertOperationId(id: unknown): asserts id is string {
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("operationId deve ser UUID");
  }
}
function operationDir(id: string): string { assertOperationId(id); return managedPath("operations", id); }
function statePath(id: string): string { return join(operationDir(id), "operation.json"); }
function logPath(id: string): string { return join(operationDir(id), "operation.log"); }
const lastLogStream = new Map<string, "stdout" | "stderr">();
function scrub(text: string, secrets: Record<string, string>): string {
  return Object.values(secrets).filter(Boolean).sort((a, b) => b.length - a.length).reduce((clean, value) =>
    clean.split(JSON.stringify(value).slice(1, -1)).join("[REDACTED]").split(value).join("[REDACTED]"), text);
}
function atomicWrite(path: string, value: unknown): void {
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  renameSync(temporary, path);
}

export function createOperation(input: Omit<OperationRecord, "version" | "status" | "createdAt" | "updatedAt">, secrets: Record<string, string> = {}): OperationRecord {
  assertOperationId(input.id);
  mkdirSync(managedPath("operations"), { recursive: true });
  try { mkdirSync(operationDir(input.id)); } catch (error: any) {
    if (error?.code === "EEXIST") throw Object.assign(new Error("operationId já existe"), { statusCode: 409 });
    throw error;
  }
  const now = new Date().toISOString();
  const sanitized = JSON.parse(scrub(JSON.stringify(input), secrets));
  const record: OperationRecord = { version: 1, status: "starting", createdAt: now, updatedAt: now,
    ...sanitized, id: input.id, type: input.type };
  writeFileSync(logPath(input.id), "", { flag: "wx" });
  lastLogStream.delete(input.id);
  atomicWrite(statePath(input.id), record);
  return record;
}

export function updateOperation(id: string, change: Partial<OperationRecord>, secrets: Record<string, string> = {}): OperationRecord {
  const record = JSON.parse(readFileSync(statePath(id), "utf8")) as OperationRecord;
  if (record.version !== 1 || record.id !== id) throw new Error("registro de operação inválido");
  const sanitized = JSON.parse(scrub(JSON.stringify(change), secrets));
  const updated = { ...record, ...sanitized, id: record.id, version: 1 as const, updatedAt: new Date().toISOString() };
  atomicWrite(statePath(id), updated);
  if (updated.status === "succeeded" || updated.status === "failed") lastLogStream.delete(id);
  return updated;
}

/** Input is scrubbed again even though executor callbacks are already post-redaction. */
export function appendOperationLog(id: string, channel: "stdout" | "stderr", text: string, secrets: Record<string, string> = {}): void {
  const clean = scrub(text, secrets);
  if (!clean) return;
  const previous = lastLogStream.get(id);
  const prefix = channel === previous ? "" : `${previous ? "\n" : ""}[${channel}] `;
  appendFileSync(logPath(id), prefix + clean, "utf8");
  lastLogStream.set(id, channel);
}

export function readOperation(id: string, offset: number, secrets: Record<string, string> = {}): OperationRecord & {
  operationStatePath: string; operationLogPath: string; hasHarborJob: boolean; log: LogTail;
} {
  assertOperationId(id);
  if (!existsSync(statePath(id))) throw Object.assign(new Error("operação não encontrada"), { statusCode: 404 });
  const record = JSON.parse(scrub(readFileSync(statePath(id), "utf8"), secrets)) as OperationRecord;
  const log = tailTextFile(logPath(id), offset, secrets);
  if (!log) throw new Error("log de operação ausente");
  return { ...record, operationStatePath: statePath(id), operationLogPath: logPath(id),
    hasHarborJob: operationHarborJobExists(record), log };
}

/** A recorded invocation name is audit data; it becomes a Logs destination only if it exists. */
export function operationHarborJobExists(operation: OperationRecord): boolean {
  if (!operation.harborJobName) return false;
  const path = safeJoinUnderDir(operation.jobsDir, operation.harborJobName);
  if (!path || !existsSync(path)) return false;
  try { return statSync(path).isDirectory(); } catch { return false; }
}

export function operationExecutionUncertain(operation: OperationRecord, activeIds: ReadonlySet<string>): boolean {
  return (operation.status === "starting" || operation.status === "running") && !activeIds.has(operation.id);
}
