import { saveHarnessIntegration, deleteHarnessIntegration } from "./harness-integrations.ts";
import { resolveJudgeConnection } from "./judge-harness.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAnalysisSession, readAnalysisSession, sessionAnalysisInput } from "./analysis-session.ts";
import { writeRegistry } from "./paths.ts";

test("analysis session freezes model, agent, prompt and all rubrics across later requests", () => {
  const root = mkdtempSync(join(tmpdir(), "hek-analysis-session-")), old = process.env.HARBOR_EVAL_STATE_DIR;
  process.env.HARBOR_EVAL_STATE_DIR = root;
  try {
    writeRegistry("models", [{ id: "m", label: "Model", value: "fixture/model" }]);
    writeRegistry("judges", [{ id: "j", label: "Judge", modelId: "m", agentValue: "mini-swe-agent", timeoutHours: 24, promptTemplate: "original prompt" }]);
    writeRegistry("criteria", [{ id: "c", name: "quality", description: "original criterion", guidance: "guide" }]);
    writeRegistry("rubrics", [{ id: "r", label: "Rubric", criterionIds: ["c"] }]);
    assert.throws(() => createAnalysisSession({ judgeId: "j", rubricIds: ["r"] }), /curada/);
    assert.throws(() => createAnalysisSession({ judgeId: "j", validationMode: "true" }), /boolean/);
    assert.throws(() => createAnalysisSession({ judgeId: "j", rubricIds: ["missing"], validationMode: true }), /inexistente/);
    const session = createAnalysisSession({ judgeId: "j", rubricIds: ["r", "__default__"], validationMode: true });
    for (const name of ["models", "judges", "criteria", "rubrics"] as const) writeRegistry(name, []);
    const reloaded = readAnalysisSession(session.id), inputs = sessionAnalysisInput(reloaded, "r");
    assert.equal(reloaded.judgeModel, "fixture/model");
    assert.equal(reloaded.agent, "mini-swe-agent");
    assert.equal(reloaded.timeoutHours, 24);
    assert.equal(readFileSync(inputs.promptPath!, "utf8"), "original prompt");
    assert.match(readFileSync(inputs.rubricPath!, "utf8"), /original criterion/);
    assert.equal(sessionAnalysisInput(reloaded, "__default__").rubricPath, undefined);
    assert.throws(() => sessionAnalysisInput(reloaded, "foreign"), /não pertence/);
    assert.throws(() => readAnalysisSession("../escape"), /id inválido/);
  } finally {
    if (old === undefined) delete process.env.HARBOR_EVAL_STATE_DIR; else process.env.HARBOR_EVAL_STATE_DIR = old;
    rmSync(root, { recursive: true, force: true });
  }
});


test("analysis sessions persist the judge connection and linked judges prevent deletion", () => {
  const root = mkdtempSync(join(tmpdir(), "hek-judge-binding-")), old = process.env.HARBOR_EVAL_STATE_DIR;
  process.env.HARBOR_EVAL_STATE_DIR = root;
  try {
    const connection = { id: "connection", label: "Session", adapter: "codex", authMode: "api", trustedRepository: true };
    saveHarnessIntegration(connection);
    writeRegistry("models", [{ id: "model", label: "Fixture", value: "gpt-5" }]);
    writeRegistry("judges", [{ id: "judge", label: "Fixture", agentValue: "codex", modelId: "model", integrationId: "connection" }]);
    const frozen = createAnalysisSession({ judgeId: "judge", validationMode: true });
    assert.equal(readAnalysisSession(frozen.id).integrationId, "connection");
    assert.match(frozen.integrationFingerprint!, /^[a-f0-9]{64}$/);
    assert.throws(() => deleteHarnessIntegration("connection"), /juiz/);
    saveHarnessIntegration({ ...connection, version: "0.153.4" });
    assert.throws(() => resolveJudgeConnection(readAnalysisSession(frozen.id), "codex", "gpt-5"), /alterada/);
  } finally {
    if (old === undefined) delete process.env.HARBOR_EVAL_STATE_DIR; else process.env.HARBOR_EVAL_STATE_DIR = old;
    rmSync(root, { recursive: true, force: true });
  }
});
