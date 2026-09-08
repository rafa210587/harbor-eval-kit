import { resolve } from "node:path";
import { getHarborPythonPath } from "./harbor-python.ts";
import { execCommand } from "./exec.ts";
import { loadSecretsEnv } from "./secrets.ts";
import { redactOutput } from "./experiment-runner.ts";

export interface ProviderKeyTestResult { ok: boolean; testedModel: string | null; discoveredModels: string[]; error: string | null }

export function validateProviderTestModel(provider: string, model: unknown): string {
  if (typeof model !== "string" || !model.startsWith(`${provider}/`) || !/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{1,199}$/.test(model)) throw new Error("Escolha explicitamente um modelo deste provider antes do teste pago");
  return model;
}

async function probe(mode: "discover" | "test", provider: string, envKey: string, model = ""): Promise<ProviderKeyTestResult> {
  const failed = (error: string): ProviderKeyTestResult => ({ ok: false, testedModel: null, discoveredModels: [], error });
  const python = getHarborPythonPath();
  if (!python) return failed("Python do Harbor não encontrado; confira a instalação via uv");
  const secrets = loadSecretsEnv();
  if (!secrets[envKey]) return failed(`Credencial ${envKey} não cadastrada`);
  const result = await execCommand(python, [resolve(import.meta.dirname, "../python/probe_provider.py"), mode, provider, model], {
    dockerHostFix: false, extraEnv: { [envKey]: secrets[envKey] }, timeoutMs: 30000,
  });
  const stdout = redactOutput(result.stdout, secrets), stderr = redactOutput(result.stderr, secrets);
  try {
    if (result.code) return failed((stderr || stdout || `exit ${result.code}`).slice(-2000));
    return JSON.parse(stdout.trim().split("\n").at(-1)!) as ProviderKeyTestResult;
  } catch { return failed((stderr || "Resposta inválida do provider").slice(-2000)); }
}

export function testProviderKey(provider: string, envKey: string, model: unknown): Promise<ProviderKeyTestResult> {
  return probe("test", provider, envKey, validateProviderTestModel(provider, model));
}
export function discoverProviderModels(provider: string, envKey: string): Promise<ProviderKeyTestResult> {
  return probe("discover", provider, envKey);
}
