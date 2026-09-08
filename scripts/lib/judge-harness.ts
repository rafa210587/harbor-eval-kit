import { harnessIntegrationFingerprint, resolveHarnessRun, type HarnessOptions } from "./harness-integrations.ts";

export interface JudgeConnection { integrationId?: string; integrationFingerprint?: string }
export function freezeJudgeConnection(integrationId?: string, options: HarnessOptions = {}): JudgeConnection {
  return integrationId ? { integrationId, integrationFingerprint: harnessIntegrationFingerprint(integrationId, options) } : {};
}
/** Secrets stay in the process environment; sessions retain only an opaque binding digest. */
export function resolveJudgeConnection(connection: JudgeConnection, agent: string | undefined, model: string, options: HarnessOptions = {}) {
  if (!connection.integrationId) return null;
  if (connection.integrationFingerprint && connection.integrationFingerprint !== harnessIntegrationFingerprint(connection.integrationId, options)) throw new Error("Conexão do juiz alterada após a sessão; crie uma nova análise para manter a comparação equivalente.");
  const run = resolveHarnessRun(connection.integrationId, model, { ...options, trustedRepository: true });
  if (agent !== run.agentValue) throw new Error("Adapter do juiz difere da conexão; ajuste o perfil em Juízes.");
  return run;
}
