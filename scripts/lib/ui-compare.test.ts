import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { baselineIndex, candidateDifferences, cloneCandidate, createPollingGuard, experimentDownloadUrl, freezeAnalysisConfig, judgeEvaluation, judgeNeedsValidation, resultState, withAnalysisSession, withBooleanField } from "../../gui/app/compare-domain.js";
import { fieldContract, hasSpecificFieldHelp, mergeHelpIds, resolveFieldHelp } from "../../gui/app/field-help.js";
import { SAFE_TEST_SH_TEMPLATE } from "../../gui/app/task-template.js";
import { standaloneAnalysisView } from "../../gui/app/analysis-view.js";
import { createLogReadGuard } from "../../gui/app/log-domain.js";
import { taskFilesForSave } from "../../gui/app/task-domain.js";
import { firstUseChecklist } from "../../gui/app/start-domain.js";
import { initializationFailureMessage, runDeleteAction } from "../../gui/app/ui-actions.js";

test("freezeAnalysisConfig snapshots judge, rubrics and boolean validation mode", () => {
  const rubrics = ["r1", "r2"];
  const frozen = freezeAnalysisConfig({ judgeId: "j1", rubricIds: rubrics, validationMode: true });
  rubrics.push("r3");
  assert.deepEqual(frozen, { judgeId: "j1", rubricIds: ["r1", "r2"], validationMode: true });
  assert.equal(Object.isFrozen(frozen), true);
  assert.throws(() => freezeAnalysisConfig({ judgeId: "", rubricIds: [], validationMode: false }), /juiz/i);
});

test("analysis session id is required and becomes part of the frozen batch", () => {
  const config = freezeAnalysisConfig({ judgeId: "j1", rubricIds: ["r1"], validationMode: false });
  const session = withAnalysisSession(config, { id: "session-1" });
  assert.equal(session.analysisSessionId, "session-1");
  assert.equal(Object.isFrozen(session), true);
  assert.throws(() => withAnalysisSession(config, {}), /sessão congelada/i);
});

test("candidate clone is independent and baseline index remains zero-based", () => {
  const original = { agentId: "a", modelId: "m", skillsetIds: ["s"] };
  const copy = cloneCandidate(original);
  copy.skillsetIds.push("other");
  assert.deepEqual(original.skillsetIds, ["s"]);
  assert.equal(baselineIndex([{ ...original, baseline: false }, { ...copy, baseline: true }]), 1);
  assert.equal(baselineIndex([original]), undefined);
});

test("effective preview identifies dimensions changed from baseline", () => {
  const baseline = { agent: "mini", model: "p/a", skills: [{ id: "s", mode: "authored", instructions: "x" }] };
  assert.deepEqual(candidateDifferences({ agent: "mini", model: "p/b", skills: baseline.skills }, baseline), ["modelo"]);
  assert.deepEqual(candidateDifferences({ agent: "other", model: "p/a", skills: [] }, baseline), ["agente", "skills/instruções"]);
});

test("polling guard rejects a response from an obsolete tracker", () => {
  const guard = createPollingGuard();
  const first = guard.next();
  const second = guard.next();
  assert.equal(guard.isCurrent(first), false);
  assert.equal(guard.isCurrent(second), true);
  guard.invalidate();
  assert.equal(guard.isCurrent(second), false);
});

test("task editor guard ignores an older response that resolves last", async () => {
  const guard = createPollingGuard();
  const accepted = [];
  let resolveA, resolveB;
  const responseA = new Promise((resolve) => { resolveA = resolve; });
  const responseB = new Promise((resolve) => { resolveB = resolve; });
  const open = async (name, response) => {
    const token = guard.next();
    const value = await response;
    if (guard.isCurrent(token)) accepted.push(`${name}:${value}`);
  };
  const a = open("A", responseA);
  const b = open("B", responseB);
  resolveB("conteúdo B");
  await b;
  resolveA("conteúdo A tardio");
  await a;
  assert.deepEqual(accepted, ["B:conteúdo B"]);
  const tasks = readFileSync(new URL("../../gui/app/tasks.js", import.meta.url), "utf8");
  assert.match(tasks, /if \(!taskEditorGuard\.isCurrent\(token\)\) return;/);
  assert.match(tasks, /panel\.dataset\.path = path;[\s\S]*?\$\("#task-editor-save"\)\.disabled = false;/);
});

test("log tail guard rejects old directory, job, file and generation responses", () => {
  const guard = createLogReadGuard();
  const a = { jobsDir: "jobs-a", job: "same-name", file: "trial.log" };
  guard.select(a);
  const old = guard.snapshot(a, 120);
  const b = { jobsDir: "jobs-b", job: "same-name", file: "trial.log" };
  guard.select(b);
  assert.equal(guard.isCurrent(old, b), false);
  const current = guard.snapshot(b, 0);
  assert.equal(guard.isCurrent(current, b), true);
  guard.select(b);
  assert.equal(guard.isCurrent(current, b), false);
});

test("delayed old log response cannot append after a directory switch", async () => {
  const guard = createLogReadGuard();
  const visible = [];
  let resolveOld;
  const delayed = new Promise((resolve) => { resolveOld = resolve; });
  const oldContext = { jobsDir: "jobs-a", job: "shared", file: "trial.log" };
  guard.select(oldContext);
  const request = guard.snapshot(oldContext, 200);
  const applyOld = delayed.then((content) => {
    const current = { jobsDir: "jobs-b", job: "shared", file: "trial.log" };
    if (guard.isCurrent(request, current)) visible.push(content);
  });
  guard.select({ jobsDir: "jobs-b", job: "shared", file: "trial.log" });
  resolveOld("chunk da pasta A");
  await applyOld;
  assert.deepEqual(visible, []);
});

test("report URL is canonical and result state does not turn missing data into zero", () => {
  assert.equal(experimentDownloadUrl("jobs antigos", "run/1", "json"), "/api/experiments/run%2F1/report?jobsDir=jobs%20antigos&format=json");
  assert.equal(resultState({ ok: false }), "Pendente");
  assert.equal(resultState({ ok: false, error: "boom" }), "Falhou");
  assert.equal(resultState({ ok: false, error: "Podman socket indisponível" }), "Falha de infraestrutura");
  assert.equal(resultState({ ok: false, nErrors: 1 }), "Falha do agente");
  assert.equal(resultState({ ok: true }), "Concluído");
  assert.equal(resultState({ ok: true }, true), "Configuração validada; sem execução");
});

test("judge evaluation exposes scores and never ranks validation or incomplete analyses", () => {
  assert.equal(judgeEvaluation({ passRate: 0.75 }), "75% PASS");
  assert.equal(judgeEvaluation({ analyses: [] }), "Não analisado");
  assert.equal(judgeEvaluation({ analyses: [{ validationMode: true, analysis: { aggregate: { pass: 1 } } }] }), "Validação — sem nota");
  assert.equal(judgeEvaluation({ analyses: [{ analysis: { aggregate: { incompleteTrials: 2 } } }] }), "Incompleta (2 trials)");
  assert.equal(judgeEvaluation({ analyses: [{ analysis: { aggregate: { unknown: 1 } } }] }), "Inconclusiva (1 check)");
  assert.equal(judgeEvaluation({ analyses: [
    { analysisBatchId: "same", ok: false, analysis: null },
    { analysisBatchId: "same", ok: true, analysis: { aggregate: { applicable: 1 } } },
  ] }), "Falhou — sem nota");
});

test("field help always states purpose, example, default and optionality", () => {
  const text = fieldContract({ label: "Tentativas", placeholder: "2", value: "1", required: false, type: "number", checked: false });
  assert.match(text, /Finalidade:/);
  assert.match(text, /Exemplo: 2/);
  assert.match(text, /Padrão: 1/);
  assert.match(text, /Opcional:/);
});

test("DOM forEach index can never replace field help text", () => {
  assert.match(resolveFieldHelp("f-label", 20, "fallback"), /Nome curto/);
  assert.equal(resolveFieldHelp("unknown", 21, "fallback"), "fallback");
  assert.equal(resolveFieldHelp("unknown", "ajuda dinâmica", "fallback"), "ajuda dinâmica");
});

test("every static visible field has specific help or an explicit shared description", () => {
  const html = readFileSync(new URL("../../gui/index.html", import.meta.url), "utf8");
  const controls = [...html.matchAll(/<(?:input|select|textarea)\b[^>]*>/g)].map((match) => match[0]);
  const missing = controls.filter((tag) => !/type="hidden"/.test(tag)).filter((tag) => {
    if (/data-field-help="off"/.test(tag) || /aria-describedby=/.test(tag)) return false;
    const id = tag.match(/id="([^"]+)"/)?.[1];
    return !id || !hasSpecificFieldHelp(id);
  });
  assert.deepEqual(missing, []);
});

test("every static checkbox group exposes valid shared help for generated inputs", () => {
  const html = readFileSync(new URL("../../gui/index.html", import.meta.url), "utf8");
  const groups = [...html.matchAll(/<div\b[^>]*class="[^"]*checkbox-group[^"]*"[^>]*>/g)].map((match) => match[0]);
  assert.ok(groups.length >= 6);
  for (const group of groups) {
    const helpId = group.match(/aria-describedby="([^"]+)"/)?.[1];
    assert.ok(helpId, `grupo sem aria-describedby: ${group}`);
    assert.match(html, new RegExp(`id="${helpId}"[^>]*class="[^"]*hint`));
  }
  assert.equal(mergeHelpIds("local shared", "shared group", ""), "local shared group");
  const core = readFileSync(new URL("../../gui/app/core.js", import.meta.url), "utf8");
  assert.match(core, /input\.setAttribute\("aria-describedby", describedBy\)/);
});

test("standalone analyze sends validationMode as a real boolean", () => {
  assert.deepEqual(withBooleanField({ path: "jobs/x", validationMode: "on" }, "validationMode", true), { path: "jobs/x", validationMode: true });
  assert.deepEqual(withBooleanField({ path: "jobs/x" }, "validationMode", false), { path: "jobs/x", validationMode: false });
});

test("editing a validation judge keeps its non-curated model selectable", () => {
  const models = [{ id: "cheap", value: "deepseek/chat" }, { id: "curated", value: "anthropic/opus" }];
  const curated = [{ value: "anthropic/opus" }];
  assert.equal(judgeNeedsValidation(models, curated, "cheap"), true);
  assert.equal(judgeNeedsValidation(models, curated, "curated"), false);
});

test("new task verifier fails safely instead of approving a stub", () => {
  const activeLines = SAFE_TEST_SH_TEMPLATE.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  assert.ok(activeLines.includes("echo 0 > /logs/verifier/reward.txt"));
  assert.ok(activeLines.includes("exit 1"));
  assert.equal(activeLines.includes("echo 1 > /logs/verifier/reward.txt"), false);
});

test("task editor preserves an absent solution until the user writes one", () => {
  const base = { instruction: "i", dockerfile: "d", solveSh: "", testSh: "t" };
  assert.equal(Object.hasOwn(taskFilesForSave(base, false), "solveSh"), false);
  assert.equal(taskFilesForSave({ ...base, solveSh: "#!/bin/bash\ntrue" }, false).solveSh, "#!/bin/bash\ntrue");
  assert.equal(taskFilesForSave(base, true).solveSh, "");
  const tasks = readFileSync(new URL("../../gui/app/tasks.js", import.meta.url), "utf8");
  assert.match(tasks, /files\.solveSh \?\? ""/);
  assert.doesNotMatch(tasks, /files\.solveSh \|\| TASK_TEMPLATES\.solveSh/);
});

test("first-use checklist accepts a free agent but still requires a selected task", () => {
  const free = firstUseChecklist({ agents: [{ agentValue: "oracle" }], freeAgents: ["oracle", "nop"], taskPath: "", hasTasks: true });
  assert.equal(free[0].done, false);
  assert.equal(free[0].tab, "compare");
  assert.match(free.at(-1).label, /dispensa modelo e credencial/);
  assert.equal(free.some((item) => item.tab === "models" || item.tab === "secrets"), false);
  const paid = firstUseChecklist({ agents: [{ agentValue: "mini-swe-agent" }], taskPath: "evals/x/y", hasTasks: true });
  assert.equal(paid.find((item) => item.tab === "models").done, false);
  assert.equal(paid.find((item) => item.tab === "secrets").done, false);
  const domain = readFileSync(new URL("../../gui/app/start-domain.js", import.meta.url), "utf8");
  assert.doesNotMatch(domain, /oracle|nop/);
});

test("failed deletion unlocks controls and leaves a visible error", async () => {
  const locks = [];
  let message = "stale";
  const deleted = await runDeleteAction(async () => { throw new Error("item ainda está em uso"); }, {
    setLocked: (locked) => locks.push(locked),
    setError: (value) => { message = value; },
  });
  assert.equal(deleted, false);
  assert.deepEqual(locks, [true, false]);
  assert.match(message, /Não foi possível remover: item ainda está em uso/);
  const core = readFileSync(new URL("../../gui/app/core.js", import.meta.url), "utf8");
  assert.match(core, /delBtn\.onclick = \(\) => runDeleteAction/);
});

test("partial initialization names every failed area", () => {
  const message = initializationFailureMessage([
    { label: "catálogo", result: { status: "rejected", reason: new Error("registro inválido") } },
    { label: "tasks", result: { status: "fulfilled", value: [] } },
    { label: "visualizadores", result: { status: "rejected", reason: new Error("porta indisponível") } },
  ]);
  assert.match(message, /interface carregou parcialmente/i);
  assert.match(message, /catálogo: registro inválido/);
  assert.match(message, /visualizadores: porta indisponível/);
  assert.equal(initializationFailureMessage([{ label: "ok", result: { status: "fulfilled" } }]), "");
  const main = readFileSync(new URL("../../gui/app/main.js", import.meta.url), "utf8");
  assert.match(main, /\$\("#initialization-status"\)\.textContent = initializationFailureMessage/);
});

test("checkbox help is placed after the whole inline control", () => {
  const help = readFileSync(new URL("../../gui/app/field-help.js", import.meta.url), "utf8");
  assert.match(help, /field\.closest\("\.checkbox-inline"\) \|\| field\.closest\("label"\)/);
});

test("concurrency help describes Harbor processes instead of claiming trial concurrency", () => {
  const help = readFileSync(new URL("../../gui/app/field-help.js", import.meta.url), "utf8");
  assert.match(help, /Processos Harbor de candidatos simultâneos/);
  assert.match(help, /paralelizar tasks internamente/);
});

test("responsive layout lets form panes shrink while tables scroll locally", () => {
  const css = readFileSync(new URL("../../gui/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.compare-layout\s*\{[^}]*minmax\(0, 420px\) minmax\(0, 1fr\)/s);
  assert.match(css, /input, select, textarea\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%/s);
  assert.match(css, /\.row-inline > \*\s*\{[^}]*min-width:\s*0/s);
  assert.match(css, /\.table-wrap\s*\{[^}]*overflow-x:\s*auto;[^}]*max-width:\s*100%;[^}]*min-width:\s*0/s);
});

test("standalone analysis preserves PASS, FAIL, N/A, unknown, cost and literal text", () => {
  const suspiciousText = '{"looks":"like JSON"}';
  const view = standaloneAnalysisView({
    validationMode: true,
    judgeModel: "deepseek/flash",
    analysis: {
      results: [{ trial_name: "trial-a", summary: suspiciousText, checks: {
        correct: { outcome: "pass", explanation: suspiciousText },
        broken: { outcome: "fail" },
        skipped: { outcome: "not_applicable" },
        loaded: { outcome: "loaded" },
      } }],
      aggregate: { nTrials: 1, pass: 1, fail: 1, notApplicable: 1, unknown: 1, costUsd: 0.009966864 },
    },
  });
  assert.equal(view.validationMode, true);
  assert.equal(view.costUsd, 0.009966864);
  assert.deepEqual(view.trials[0].checks.map((check) => check.label), ["PASS", "FAIL", "N/A", "Desconhecido"]);
  assert.equal(view.trials[0].summary, suspiciousText);
  assert.equal(view.trials[0].checks[0].explanation, suspiciousText);
});

test("UI wiring uses structured cost acknowledgement and one frozen session per action", () => {
  const compare = readFileSync(new URL("../../gui/app/compare.js", import.meta.url), "utf8");
  const controller = readFileSync(new URL("../../gui/app/compare-analysis-controller.js", import.meta.url), "utf8");
  const analysis = readFileSync(new URL("../../gui/app/compare-analysis.js", import.meta.url), "utf8");
  assert.match(compare, /err\.needsAcknowledge !== true/);
  assert.doesNotMatch(compare, /teto de \\$\|às cegas/);
  assert.equal(controller.match(/api\("POST", "\/api\/analysis-sessions"/g)?.length, 2);
  assert.match(analysis, /analysisSessionId: batchConfig\.analysisSessionId/);
});
