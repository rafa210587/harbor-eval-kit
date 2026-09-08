import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { baselineIndex, candidateDifferences, cloneCandidate, createPollingGuard, experimentDownloadUrl, freezeAnalysisConfig, judgeNeedsValidation, resultState, withBooleanField } from "../../gui/app/compare-domain.js";
import { fieldContract, hasSpecificFieldHelp, mergeHelpIds, resolveFieldHelp } from "../../gui/app/field-help.js";
import { SAFE_TEST_SH_TEMPLATE } from "../../gui/app/task-template.js";
import { standaloneAnalysisView } from "../../gui/app/analysis-view.js";

test("freezeAnalysisConfig snapshots judge, rubrics and boolean validation mode", () => {
  const rubrics = ["r1", "r2"];
  const frozen = freezeAnalysisConfig({ judgeId: "j1", rubricIds: rubrics, validationMode: true });
  rubrics.push("r3");
  assert.deepEqual(frozen, { judgeId: "j1", rubricIds: ["r1", "r2"], validationMode: true });
  assert.equal(Object.isFrozen(frozen), true);
  assert.throws(() => freezeAnalysisConfig({ judgeId: "", rubricIds: [], validationMode: false }), /juiz/i);
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

test("report URL is canonical and result state does not turn missing data into zero", () => {
  assert.equal(experimentDownloadUrl("jobs antigos", "run/1", "json"), "/api/experiments/run%2F1/report?jobsDir=jobs%20antigos&format=json");
  assert.equal(resultState({ ok: false }), "Pendente");
  assert.equal(resultState({ ok: false, error: "boom" }), "Falhou");
  assert.equal(resultState({ ok: false, error: "Podman socket indisponível" }), "Falha de infraestrutura");
  assert.equal(resultState({ ok: false, nErrors: 1 }), "Falha do agente");
  assert.equal(resultState({ ok: true }), "Concluído");
  assert.equal(resultState({ ok: true }, true), "Configuração validada; sem execução");
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
