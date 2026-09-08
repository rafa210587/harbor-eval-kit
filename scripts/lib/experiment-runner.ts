import { join } from "node:path";
import { existsSync } from "node:fs";
import type { ChildProcess } from "node:child_process";
import type { ExecOptions, ExecResult, ResultRow } from "./types.ts";
import type { ExperimentPlan } from "./experiment-plan.ts";
import { guardExperiment } from "./experiment-plan.ts";
import { prepareExperiment, writeExperiment, experimentDirectory } from "./experiment-store.ts";
import { buildHarborRunArgs } from "./naming.ts";
import { execHarbor, runPool } from "./exec.ts";
import { loadSecretsEnv } from "./secrets.ts";
import { parseResult, writeReport } from "./results.ts";
import { openCandidateLog, type CandidateLogWriter } from "./experiment-logs.ts";
import { resolveHarnessRun } from "./harness-integrations.ts";
import { loadRedactionSecrets } from "./redaction-secrets.ts";

export interface RunControl { cancelled: boolean; children: Set<ChildProcess>; jobsDir: string; jobNames: Set<string> }
export function redactOutput(text: string, secrets: Record<string, string>): string {
  let clean = text;
  for (const value of Object.values(secrets).filter(Boolean).sort((a,b) => b.length - a.length)) {
    clean = clean.split(JSON.stringify(value).slice(1, -1)).join("[REDACTED]");
    clean = clean.split(value).join("[REDACTED]");
  }
  return clean;
}
export async function runExperiment(plan: ExperimentPlan, options: {
  costCapUsd?: unknown; acknowledgeCost?: unknown; control?: RunControl;
  executor?: (args: string[], opts?: ExecOptions) => Promise<ExecResult>;
  secrets?: Record<string, string>; dockerHostFix?: boolean;
} = {}) {
  const secrets = options.secrets ?? loadSecretsEnv();
  const redactionSecrets = { ...loadRedactionSecrets(), ...secrets };
  const serialized = JSON.stringify(plan);
  if (redactOutput(serialized, redactionSecrets) !== serialized) {
    throw new Error("credencial encontrada nos inputs do experimento; use apenas o ambiente de Credenciais");
  }
  const verdict = guardExperiment(plan, options.costCapUsd, options.acknowledgeCost);
  if (!verdict.allowed) throw Object.assign(new Error(verdict.reason!), { statusCode: 409, estimate: verdict.estimate, needsAcknowledge: true });
  if (existsSync(experimentDirectory(plan.jobsDir, plan.id))) throw Object.assign(new Error("runId já existe; reabra o experimento ou gere um novo ID"), { statusCode: 409 });
  // Resolve a connection once, before freezing/starting any candidate. Sensitive env
  // stays in memory and is never part of the experiment snapshot or public plan.
  const connections = new Map(plan.candidates.filter(c => c.integrationId).map(c => {
    if (!c.model) throw new Error("integração requer modelo explícito");
    if (plan.extra.length) throw new Error("integração configurada não aceita argumentos extras concorrentes; configure suas opções no perfil");
    const connection = resolveHarnessRun(c.integrationId!, c.model, { trustedRepository: true, secrets });
    if (connection.agentValue !== c.agent) throw new Error("adapter do agente difere da integração vinculada");
    return [c.id, connection] as const;
  }));
  const frozenPlan = { ...plan, candidates: plan.candidates.map(candidate => ({ ...candidate, ...(connections.has(candidate.id) ? { integration: connections.get(candidate.id)!.snapshot } : {}) })) };
  const record = prepareExperiment(frozenPlan);
  const execute = options.executor ?? execHarbor;
  const control = options.control;
  record.status = "running";
  writeExperiment(record);
  try {
    const version = await execute(["--version"], { timeoutMs: 10000, dockerHostFix: options.dockerHostFix });
    record.harborVersion = redactOutput(version.stdout.trim(), redactionSecrets) || undefined;
    const rows = await runPool(record.plan.candidates, record.plan.concurrency, async c => {
      const row: ResultRow = { jobName: c.jobName, agent: c.label, model: c.model ?? "(default)", skillset: c.skillset.label, ok: false };
      if (control?.cancelled) row.error = "cancelado antes de iniciar";
      else {
        control?.jobNames.add(c.jobName);
        let child: ChildProcess | undefined;
        let candidateLog: CandidateLogWriter | undefined;
        const captured = new Set<"stdout" | "stderr">();
        const connection = connections.get(c.id);
        const args = buildHarborRunArgs({ taskPath: record.plan.taskPath, combo: c, jobsDir: plan.jobsDir, name: c.jobName, env: plan.env, nAttempts: String(plan.nAttempts), extra: connection?.extraArgs ?? plan.extra, autoYes: true, printConfigOnly: plan.dryRun });
        try {
          if (existsSync(join(plan.jobsDir, c.jobName))) throw new Error("diretório de job já existe; execução recusada");
          candidateLog = openCandidateLog(plan.jobsDir, plan.id, c.id, Object.values(redactionSecrets));
          const result = await execute(args, { extraEnv: connection?.extraEnv ?? secrets, isolatedEnv: !!connection, redactValues: Object.values(redactionSecrets), dockerHostFix: options.dockerHostFix, onSpawn: process => { child = process; control?.children.add(process); }, onOutput: (stream, text) => { captured.add(stream); candidateLog?.write(stream, text); } });
          if (!captured.has("stdout")) candidateLog.write("stdout", result.stdout);
          if (!captured.has("stderr")) candidateLog.write("stderr", result.stderr);
          row.durationSec = result.durationSec;
          if (result.code !== 0) row.error = redactOutput(result.stderr.trim() || `exit ${result.code}`, redactionSecrets).slice(-4000);
          else if (!plan.dryRun) Object.assign(row, parseResult(join(plan.jobsDir, c.jobName)));
          row.ok = result.code === 0 && !row.error && (!row.nErrors || row.nErrors === 0);
        } catch (err) {
          row.error = redactOutput((err as Error).message, redactionSecrets);
          candidateLog?.write("stderr", `${row.error}\n`);
        }
        finally { candidateLog?.close(); if (child) control?.children.delete(child); }
      }
      record.rows.push(row);
      writeExperiment(record);
      return row;
    });
    record.rows = rows;
    record.status = control?.cancelled ? "cancelled" : rows.some(r => !r.ok) ? "failed" : "finished";
    record.finishedAt = new Date().toISOString();
    writeExperiment(record);
    const outPrefix = join(experimentDirectory(plan.jobsDir, plan.id), "report");
    writeReport(rows, outPrefix, redactionSecrets);
    return { ok: true, experimentId: plan.id, cancelled: control?.cancelled ?? false, rows, reportJson: `${outPrefix}.json`, reportCsv: `${outPrefix}.csv` };
  } catch (err) {
    record.status = "failed";
    record.error = redactOutput((err as Error).message, redactionSecrets);
    record.finishedAt = new Date().toISOString();
    writeExperiment(record);
    throw err;
  }
}
