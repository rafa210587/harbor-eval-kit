import { freezeJudgeConnection, type JudgeConnection } from "./judge-harness.ts";
// A comparison's judge inputs are frozen once for all candidates and rubrics, even across
// subsequent HTTP requests or a server restart. Catalog edits only affect new sessions.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { managedPath, newId, readRegistry } from "./paths.ts";
import { assertSafeId } from "./registry-validation.ts";
import { isJudgeModelAllowed } from "./catalog.ts";
import { resolveRubricCriteria, serializeRubricToml } from "./materialize.ts";
import { loadSecretsEnv } from "./secrets.ts";
import type { CriterionEntry, JudgeEntry, ModelEntry, RubricEntry } from "./types.ts";

export interface AnalysisSession extends JudgeConnection {
  version: 1;
  id: string;
  createdAt: string;
  judgeId: string;
  judgeModel: string;
  agent: string;
  timeoutHours?: number;
  validationMode: boolean;
  prompt: string | null;
  rubrics: { id: string; content: string | null }[];
}

export function createAnalysisSession(input: { judgeId?: unknown; rubricIds?: unknown; validationMode?: unknown }): AnalysisSession {
  assertSafeId(input.judgeId);
  if (input.validationMode !== undefined && typeof input.validationMode !== "boolean") throw new Error("validationMode deve ser boolean");
  const judge = readRegistry<JudgeEntry>("judges").find(j => j.id === input.judgeId);
  if (!judge) throw new Error("juiz inexistente");
  const model = readRegistry<ModelEntry>("models").find(m => m.id === judge.modelId)?.value;
  if (!model) throw new Error("juiz sem modelo configurado");
  const validationMode = input.validationMode === true;
  if (!validationMode && !isJudgeModelAllowed(model)) throw new Error("modelo do juiz fora da lista curada; use modo validação para testar o pipeline");
  const ids = input.rubricIds ?? ["__default__"];
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) throw new Error("rubricIds deve ser lista não vazia e sem duplicações");
  const rubrics = readRegistry<RubricEntry>("rubrics"), criteria = readRegistry<CriterionEntry>("criteria");
  const frozen = ids.map(id => {
    if (id === "__default__") return { id, content: null };
    assertSafeId(id);
    const rubric = rubrics.find(r => r.id === id);
    if (!rubric) throw new Error("rubric inexistente");
    const resolved = resolveRubricCriteria(rubric.criterionIds, criteria);
    if (!resolved.length) throw new Error("rubric sem critérios");
    return { id, content: serializeRubricToml(resolved) };
  });
  const session: AnalysisSession = { version: 1, id: newId(), createdAt: new Date().toISOString(), judgeId: judge.id,
    ...freezeJudgeConnection(judge.integrationId), timeoutHours: judge.timeoutHours ?? 8, judgeModel: model, agent: judge.agentValue, validationMode, prompt: judge.promptTemplate?.trim() ? judge.promptTemplate : null, rubrics: frozen };
  const serialized = JSON.stringify(session);
  if (Object.values(loadSecretsEnv()).some(value => value && serialized.includes(JSON.stringify(value).slice(1, -1)))) throw new Error("credencial nos inputs do juiz; use somente o ambiente de Credenciais");
  const dir = managedPath("analysis-sessions", session.id);
  mkdirSync(dir, { recursive: true });
  if (session.prompt !== null) writeFileSync(join(dir, "prompt.txt"), session.prompt, { flag: "wx" });
  for (const [index, rubric] of frozen.entries()) if (rubric.content !== null) writeFileSync(join(dir, `rubric-${index}.toml`), rubric.content, { flag: "wx" });
  writeFileSync(join(dir, "session.json"), JSON.stringify(session, null, 2), { flag: "wx" });
  return session;
}

export function readAnalysisSession(id: unknown): AnalysisSession {
  assertSafeId(id);
  const session = JSON.parse(readFileSync(managedPath("analysis-sessions", id, "session.json"), "utf8"));
  if (session.version !== 1 || session.id !== id || typeof session.judgeModel !== "string" || typeof session.validationMode !== "boolean" || !Array.isArray(session.rubrics)) throw new Error("sessão de análise inválida");
  return session;
}

export function sessionAnalysisInput(session: AnalysisSession, rubricId: unknown) {
  const index = session.rubrics.findIndex(r => r.id === (rubricId || "__default__"));
  if (index < 0) throw new Error("rubric não pertence à sessão de análise");
  return { rubricPath: session.rubrics[index].content === null ? undefined : managedPath("analysis-sessions", session.id, `rubric-${index}.toml`),
    promptPath: session.prompt === null ? undefined : managedPath("analysis-sessions", session.id, "prompt.txt") };
}
