import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ResultRow } from "./types.ts";

const object = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const number = (v: unknown): number | undefined => typeof v === "number" && Number.isFinite(v) ? v : undefined;
const count = (v: unknown): number | undefined => number(v) !== undefined && Number.isInteger(v) && (v as number) >= 0 ? v as number : undefined;

/** Missing billing remains absent; incomplete/malformed artifacts never indicate success. */
export function parseResult(jobDir: string): Partial<ResultRow> {
  const path = join(jobDir, "result.json");
  if (!existsSync(path)) return { error: "result.json not found" };
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    if (!object(data) || !object(data.stats)) return { error: "no valid 'stats' in result.json" };
    const stats = data.stats;
    if (count(stats.n_completed_trials) === undefined || count(stats.n_errored_trials) === undefined) {
      return { error: "invalid trial counts in result.json" };
    }
    let trials = 0, weightedSum = 0;
    for (const e of Object.values(object(stats.evals) ? stats.evals : {})) {
      if (!object(e)) continue;
      const mean = number(e.metrics?.[0]?.mean), n = count(e.n_trials);
      if (mean !== undefined && n && n > 0) { trials += n; weightedSum += mean * n; }
    }
    return {
      error: data.finished_at === null || stats.n_pending_trials > 0 || stats.n_running_trials > 0 || stats.n_cancelled_trials > 0
        ? "job incompleto ou com trials cancelados" : stats.n_completed_trials === 0 ? "nenhum trial concluído" : undefined,
      nTrials: stats.n_completed_trials, nErrors: stats.n_errored_trials,
      meanReward: trials ? weightedSum / trials : undefined,
      costUsd: number(stats.cost_usd), nInputTokens: count(stats.n_input_tokens), nOutputTokens: count(stats.n_output_tokens),
    };
  } catch (err) { return { error: String(err) }; }
}

/** Preserve raw per-trial metadata and aggregate only explicitly reported values. */
export function normalizeAnalysis(parsed: unknown): Record<string, any> | null {
  if (!object(parsed)) return null;
  const results = Array.isArray(parsed.results) ? parsed.results : (object(parsed.checks) || typeof parsed.summary === "string" ? [parsed] : null);
  if (!results || results.some((r: unknown) => !object(r))) return null;
  let pass = 0, fail = 0, notApplicable = 0, unknown = 0, costReportedTrials = 0, reportedCostUsd = 0;
  for (const trial of results) {
    const cost = number(trial.cost_usd) ?? number(trial.estimated_cost_usd);
    if (cost !== undefined && cost >= 0) { costReportedTrials++; reportedCostUsd += cost; }
    for (const check of Object.values(object(trial.checks) ? trial.checks : {})) {
      const outcome = object(check) ? check.outcome : undefined;
      if (outcome === "pass") pass++;
      else if (outcome === "fail") fail++;
      else if (outcome === "not_applicable") notApplicable++;
      else unknown++;
    }
  }
  const applicable = pass + fail;
  const costComplete = results.length > 0 && costReportedTrials === results.length;
  return { ...parsed, results, estimated_cost_usd: costComplete ? reportedCostUsd : undefined,
    aggregate: { nTrials: results.length, pass, fail, notApplicable, unknown, applicable,
      passRate: applicable && !unknown ? pass / applicable : undefined, costComplete, costReportedTrials,
      costUsd: costComplete ? reportedCostUsd : undefined,
      reportedCostUsd: costReportedTrials ? reportedCostUsd : undefined } };
}

export function parseAnalysisJson(path: string): Record<string, any> | null {
  try { return normalizeAnalysis(JSON.parse(readFileSync(join(path, "analysis.json"), "utf8"))); }
  catch { return null; }
}

/** Prefer the report emitted by THIS invocation over a stale analysis in the input dir. */
export function resolveAnalysisJson(trialPath: string, stdout: string): Record<string, any> | null {
  const match = stdout.match(/Report:\s*([^\r\n]+\.json)\s*$/m);
  if (match) {
    try { return normalizeAnalysis(JSON.parse(readFileSync(match[1].trim(), "utf8"))); }
    catch { return null; }
  }
  return parseAnalysisJson(trialPath);
}

export function csvEscape(v: unknown): string {
  if (v === undefined || v === null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Score the latest analysis batch only. Smoke results and incomplete judgments are not ranks. */
export function summarizeAnalysisRecords(records: any[]): Pick<ResultRow, "passRate" | "judgeCostUsd"> {
  const latest = records.at(-1);
  if (!latest) return {};
  const batch = latest.analysisBatchId ? records.filter(r => r.analysisBatchId === latest.analysisBatchId) : [latest];
  const aggregates = batch.map(r => r.analysis?.aggregate);
  const completeBatch = latest.analysisBatchSize === undefined || (batch.length === latest.analysisBatchSize && new Set(batch.map(r => r.analysisBatchIndex)).size === latest.analysisBatchSize);
  const completeScore = completeBatch && batch.every((r, i) => r.ok !== false && !r.validationMode && aggregates[i] && !aggregates[i].unknown);
  const applicable = aggregates.reduce((n, a) => n + (a?.applicable ?? 0), 0);
  return {
    passRate: completeScore && applicable ? aggregates.reduce((n, a) => n + a.pass, 0) / applicable : undefined,
    judgeCostUsd: completeBatch && batch.every((r, i) => r.ok !== false && typeof aggregates[i]?.costUsd === "number") ? aggregates.reduce((n, a) => n + a.costUsd, 0) : undefined,
  };
}

export function writeReport(rows: ResultRow[], outPrefix: string): void {
  writeFileSync(`${outPrefix}.json`, JSON.stringify(rows, null, 2));
  writeFileSync(`${outPrefix}.csv`, reportCsv(rows));
}

export function reportCsv(rows: ResultRow[]): string {
  const headers: (keyof ResultRow)[] = [
    "jobName",
    "agent",
    "model",
    "skillset",
    "ok",
    "nTrials",
    "nErrors",
    "meanReward",
    "durationSec",
    "costUsd",
    "nInputTokens",
    "nOutputTokens",
    "passRate",
    "judgeCostUsd",
    "error",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => csvEscape(r[h])).join(","));
  return lines.join("\n") + "\n";
}
