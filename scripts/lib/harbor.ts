// Harbor Eval Kit - shared helpers for compare-matrix.ts and gui-server.ts.
//
// This file is the library's PUBLIC SURFACE: it re-exports every module in lib/ so callers keep
// a single import, and holds what is left of the domain that has not been split out yet
// (process execution, skill/rubric materialization, result parsing, provider key testing).
//
// Node built-ins only (no external dependencies), imported with explicit .ts extensions as
// required by Node's native type-stripping module resolution.
//
// Split out so far -- import from these directly when writing something new, and prefer growing
// them over growing this file (see AGENTS.md, "Small files"):
//   types.ts    shared interfaces, dependency-free
//   catalog.ts  the fixed lists: PROVIDERS, JUDGE_MODELS, HARBOR_AGENTS
//   paths.ts    state dir, id generation, safeJoinUnderDir
//   naming.ts   sanitize/jobName/buildHarborRunArgs
//   secrets.ts  secrets.env read/write
//   joblogs.ts  live tail of harbor's own log files
//   tasks.ts    task files on disk, discovery, judge/rubric pinning
//   litellm.ts  the disabled LiteLLM gateway seam
//   exec.ts     spawning harbor/podman and building their environment
//   materialize.ts  writing GUI-authored skills/rubrics/prompts to disk for Harbor


import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { join, basename, dirname } from "node:path";

import type { AgentEntry, CriterionEntry, ExecOptions, ExecResult, RegistryName, ResultRow, RubricCriterion, SkillEntry } from "./types.ts";
import { getStateDir, newId, safeJoinUnderDir } from "./paths.ts";
// `export *` below re-exports these for callers; it does NOT bring them into this file's own
// scope, so anything used here has to be imported here too.
import { execCommand } from "./exec.ts";

import { loadSecretsEnv } from "./secrets.ts";
import { isJudgeModelAllowed } from "./catalog.ts";
import { sanitize } from "./naming.ts";

export * from "./types.ts";
export * from "./catalog.ts";
export * from "./paths.ts";
export * from "./naming.ts";
export * from "./secrets.ts";
export * from "./joblogs.ts";
export * from "./tasks.ts";
export * from "./litellm.ts";
export * from "./exec.ts";
export * from "./materialize.ts";


// ---------- Result parsing / reporting ----------

export function parseResult(jobDir: string): {
  nTrials?: number;
  nErrors?: number;
  meanReward?: number;
  costUsd?: number;
  nInputTokens?: number;
  nOutputTokens?: number;
  error?: string;
} {
  const resultPath = join(jobDir, "result.json");
  if (!existsSync(resultPath)) return { error: "result.json not found" };
  try {
    const data = JSON.parse(readFileSync(resultPath, "utf-8")) as HarborResultJson;
    const stats = data.stats;
    if (!stats) return { error: "no 'stats' in result.json" };
    const evalEntries = Object.values(stats.evals ?? {});
    let totalTrials = 0;
    let weightedSum = 0;
    for (const e of evalEntries) {
      const mean = e.metrics?.[0]?.mean;
      const n = e.n_trials ?? 0;
      if (typeof mean === "number" && n > 0) {
        totalTrials += n;
        weightedSum += mean * n;
      }
    }
    return {
      nTrials: stats.n_completed_trials,
      nErrors: stats.n_errored_trials,
      meanReward: totalTrials > 0 ? weightedSum / totalTrials : undefined,
      costUsd: stats.cost_usd,
      nInputTokens: stats.n_input_tokens,
      nOutputTokens: stats.n_output_tokens,
    };
  } catch (err) {
    return { error: String(err) };
  }
}

export function csvEscape(v: unknown): string {
  if (v === undefined || v === null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function writeReport(rows: ResultRow[], outPrefix: string): void {
  writeFileSync(`${outPrefix}.json`, JSON.stringify(rows, null, 2));
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
    "error",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => csvEscape(r[h])).join(","));
  writeFileSync(`${outPrefix}.csv`, lines.join("\n") + "\n");
}

// ---------- State dir / registries ----------

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
/**
 * Reads `<path>/analysis.json` if `harbor analyze` wrote one there (confirmed in
 * analyzer.py:_write_analysis_json). Best-effort: returns null rather than throwing if the
 * file is missing or the shape differs from what this Harbor version produced -- callers
 * should fall back to showing raw stdout in that case.
 */
export function parseAnalysisJson(path: string): unknown | null {
  const p = join(path, "analysis.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

// ---------- Secrets ----------
// Local KEY=VALUE file in the state dir, never returned by value over the API,


// ---------- Provider key testing / model discovery ----------
// Neither of these has a `harbor` CLI surface (confirmed: `harbor --help` has no model-listing
// or key-check command) -- they call LiteLLM directly, in the same Python environment `harbor`
// itself runs in (LiteLLM is one of its hard dependencies), via a small materialized script.

let cachedHarborPythonPath: string | null | undefined;

/** Locates the python interpreter inside the `uv tool install harbor` venv (portable across
 *  OS via `uv tool dir`, rather than hardcoding uv's storage layout). Memoized per process. */
export function getHarborPythonPath(): string | null {
  if (cachedHarborPythonPath !== undefined) return cachedHarborPythonPath;
  let result: string | null = null;
  try {
    const toolsDir = execFileSync("uv", ["tool", "dir"], { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    const candidate =
      process.platform === "win32"
        ? join(toolsDir, "harbor", "Scripts", "python.exe")
        : join(toolsDir, "harbor", "bin", "python");
    result = existsSync(candidate) ? candidate : null;
  } catch (err) {
    // Only "uv isn't installed / didn't answer" is an expected failure here. A ReferenceError
    // or TypeError means THIS code is broken, and swallowing it reports the misleading
    // "Harbor isn't installed" to the user instead. That is exactly what happened once: a
    // refactor dropped the execFileSync import, and the resulting ReferenceError was caught
    // here and shown as an install problem. Let a coding error surface as a coding error.
    if (err instanceof ReferenceError || err instanceof TypeError) throw err;
    result = null;
  }
  cachedHarborPythonPath = result;
  return result;
}

const TEST_PROVIDER_KEY_SCRIPT = `
import json, os, sys

provider = sys.argv[1]
env_name = sys.argv[2]

result = {"ok": False, "testedModel": None, "discoveredModels": [], "error": None}
try:
    import litellm
    litellm.suppress_debug_info = True

    discovered = []
    try:
        discovered = litellm.get_valid_models(
            check_provider_endpoint=True, custom_llm_provider=provider
        )
    except Exception:
        discovered = []

    candidate = discovered[0] if discovered else None
    if candidate is None:
        static_models = list(litellm.models_by_provider.get(provider, []))
        candidate = static_models[0] if static_models else None

    if candidate is None:
        result["error"] = "no known model id for provider '%s' to test against" % provider
    else:
        model_ref = candidate if "/" in candidate else "%s/%s" % (provider, candidate)
        litellm.completion(
            model=model_ref,
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=5,
            timeout=20,
        )
        result["ok"] = True
        result["testedModel"] = model_ref
        result["discoveredModels"] = discovered
except Exception as e:
    result["error"] = "%s: %s" % (type(e).__name__, e)

print(json.dumps(result))
`;

function getTestProviderKeyScriptPath(): string {
  const p = join(getStateDir(), "test-provider-key.py");
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, TEST_PROVIDER_KEY_SCRIPT, "utf-8");
  return p;
}

export interface ProviderKeyTestResult {
  ok: boolean;
  testedModel: string | null;
  discoveredModels: string[];
  error: string | null;
}

/**
 * Makes one real, minimal call to the cheapest model LiteLLM knows for `provider` (`hi`,
 * `max_tokens: 5`) using the already-saved secret named `envKey` -- confirms the key actually
 * works, not just that it's saved, and opportunistically returns whatever live model catalog
 * LiteLLM could fetch for that provider along the way (empty if the provider has no
 * live-listing support in this LiteLLM version -- that's not itself a failure).
 *
 * The API key is passed to the child process via environment variable only (never argv, which
 * would be visible to other processes/logs on multi-user systems) -- same secrecy discipline
 * as every other `harbor`/`podman` child spawn in this file.
 */
export async function testProviderKey(provider: string, envKey: string): Promise<ProviderKeyTestResult> {
  const pythonPath = getHarborPythonPath();
  if (!pythonPath) {
    return {
      ok: false,
      testedModel: null,
      discoveredModels: [],
      error: "could not locate the python interpreter inside the harbor uv tool venv (is Harbor installed via 'uv tool install harbor'?)",
    };
  }
  const secrets = loadSecretsEnv();
  const apiKey = secrets[envKey];
  if (!apiKey) {
    return { ok: false, testedModel: null, discoveredModels: [], error: `no secret named ${envKey} is saved` };
  }
  const scriptPath = getTestProviderKeyScriptPath();
  const result = await execCommand(pythonPath, [scriptPath, provider, envKey], {
    dockerHostFix: false,
    extraEnv: { [envKey]: apiKey },
    timeoutMs: 30_000,
  });
  try {
    return JSON.parse(result.stdout.trim().split("\n").pop() ?? "") as ProviderKeyTestResult;
  } catch {
    return {
      ok: false,
      testedModel: null,
      discoveredModels: [],
      error: (result.stderr || result.stdout || `exit ${result.code}`).trim().slice(-2000),
    };
  }
}

// ---------- Task file editing ----------
// A task directory (created by `harbor init --task`) is plain project content meant to




