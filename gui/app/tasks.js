// Tasks: harbor init --task plus the in-browser editor for the four task files.
import { $, $$, api, escapeHtml, checkboxGroup } from "./core.js";
import { state, onRefresh } from "./state.js";
import { tabRefreshers } from "./core.js";
import { renderTaskRubricPicker } from "./judging.js";

// ================= TASKS =================
$("#task-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  data.noPytest = e.target.noPytest.checked;
  data.noSolution = e.target.noSolution.checked;
  const out = $("#task-output");
  out.textContent = "Running…";
  try {
    const res = await api("POST", "/api/tasks/init", data);
    out.textContent = (res.stdout || "") + (res.stderr || "");
    await refreshTaskList();
    const match = (res.stdout || "").replace(/\r?\n/g, "").match(/Task initialized in\s+(.+?)(?:\s*Next steps|$)/);
    // openTaskEditor scrolls the editor into view itself -- without it the editor opens ~1300px
    // below the fold and clicking "Create task" looks like it did nothing.
    if (match) await openTaskEditor(match[1].trim());
  } catch (err) { out.textContent = "Error: " + err.message; }
});

export async function refreshTaskList() {
  const tasks = await api("GET", "/api/tasks");

  const list = $("#task-list");
  list.innerHTML = tasks.length ? "" : '<p class="muted">No tasks found under evals/ or datasets/.</p>';
  for (const t of tasks) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<div class="row-main"><div class="row-title">${escapeHtml(t.path)} <span class="badge">${t.source}</span></div></div><div class="row-actions"></div>`;
    const badge = document.createElement("em");
    badge.className = "muted";
    badge.textContent = t.stub ? "stub" : "ready";
    row.querySelector(".row-actions").appendChild(badge);
    const editBtn = document.createElement("button");
    editBtn.textContent = "Edit files";
    editBtn.onclick = () => openTaskEditor(t.path);
    row.querySelector(".row-actions").appendChild(editBtn);
    list.appendChild(row);
  }

  const picker = $("#compare-task-picker");
  picker.innerHTML = '<option value="">— escolher uma task cadastrada —</option>' +
    tasks.map((t) => `<option value="${escapeHtml(t.path)}">[${t.source}] ${escapeHtml(t.path)}${t.stub ? " (stub — precisa preencher)" : ""}</option>`).join("");
  // Re-rendering the options resets the selection, which left the picker showing the
  // placeholder while the path field below still held a task -- two widgets disagreeing about
  // the same value. Re-select whatever the path field actually points at.
  const currentPath = $("#compare-form input[name=path]").value;
  if (currentPath && tasks.some((t) => t.path === currentPath)) picker.value = currentPath;
}
tabRefreshers.tasks = refreshTaskList;
$("#task-refresh").addEventListener("click", refreshTaskList);

$("#compare-task-picker").addEventListener("change", (e) => {
  if (e.target.value) $("#compare-form input[name=path]").value = e.target.value;
});

// Grounded in Harbor's own task-quality rubric (harbor/cli/quality_checker/default-rubric.toml
// in the installed package) -- these templates are shaped to satisfy exactly what `harbor check`
// grades a task against: behavior described == behavior tested, no hardcoded solution, no
// tests/solution baked into the image, test deps installed in test.sh not the Dockerfile, etc.
const TASK_TEMPLATES = {
  instruction: `# Título da task

## Contexto
Descreva brevemente o cenário/codebase que o agent vai encontrar (arquivos existentes, estado inicial).

## Objetivo
O que precisa ser implementado ou corrigido — em termos claros e verificáveis, não vagos.

## Requisitos
- Requisito 1 — específico e testável (nomes exatos de arquivo/função/endpoint quando relevante)
- Requisito 2
- Formato de saída esperado, se houver: schema exato, nomes de campos, tipos

## Fora de escopo
- O que o agent NÃO precisa (ou não deve) fazer

## Arquivos relevantes
- \`caminho/arquivo.ext\` — o que tem lá e por que importa

Dica de qualidade: tudo que os testes verificam precisa estar descrito aqui, e tudo que está
descrito aqui precisa ser verificado pelos testes — instrução e teste devem cobrir exatamente
a mesma coisa (nem mais, nem menos).`,

  dockerfile: `FROM <imagem-base-oficial>:<versao-pinada>
# ex.: python:3.13-slim

WORKDIR /app

# Copie só o necessário pro agent ter o que resolver a task
# COPY app/ /app/

# Dependencias de RUNTIME da aplicacao (nao de teste!) -- mantenha versoes pinadas
# RUN pip install --no-cache-dir -r requirements.txt

# Nunca copie tests/ ou solution/ pra dentro da imagem -- o harness ja cuida
# disso na hora certa, e deixar isso aqui da pro agent "ver a resposta".`,

  solveSh: `#!/bin/bash
set -euo pipefail

# Solucao de referencia: demonstre o PROCESSO que um agent real faria pra
# chegar na resposta -- nao escreva/echo o resultado final ja pronto (isso
# conta como solucao "hardcoded" e invalida o valor da task como benchmark).
#
# Exemplo:
# python3 processa_dados.py --input dados.csv --output resultado.json`,

  testSh: `#!/bin/bash
set -euo pipefail
mkdir -p /logs/verifier

# Dependencias de TESTE vao aqui, nao no Dockerfile (senao o agent ja roda com
# elas instaladas, o que conta como dependencia de teste vazando pro ambiente).
# pip install --no-cache-dir pytest==8.4.1

# Rode a verificacao de verdade e capture a saida
# pytest -q /tests/test_outputs.py > /logs/verifier/test-stdout.txt 2>&1
STATUS=$?

if [ $STATUS -eq 0 ]; then
  echo 1 > /logs/verifier/reward.txt
else
  echo 0 > /logs/verifier/reward.txt
fi`,
};

async function openTaskEditor(path) {
  const panel = $("#task-editor-panel");
  $("#task-editor-path").textContent = path;
  $("#task-editor-status").textContent = "Loading…";
  panel.hidden = false;
  panel.dataset.path = path;
  try {
    const files = await api("GET", `/api/tasks/detail?path=${encodeURIComponent(path)}`);
    $("#task-editor-instruction").value = files.instruction || TASK_TEMPLATES.instruction;
    $("#task-editor-dockerfile").value = files.dockerfile || TASK_TEMPLATES.dockerfile;
    $("#task-editor-solve").value = files.solveSh || TASK_TEMPLATES.solveSh;
    $("#task-editor-test").value = files.testSh || TASK_TEMPLATES.testSh;

    const rubricDefault = await api("GET", `/api/tasks/rubric-default?path=${encodeURIComponent(path)}`);
    renderTaskRubricPicker(rubricDefault.rubricIds || []);
    $("#task-editor-judge-picker").value = rubricDefault.judgeId || "";
    $("#task-editor-status").textContent = "";
  } catch (err) {
    $("#task-editor-status").textContent = "Error: " + err.message;
  }
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

$("#task-editor-save").addEventListener("click", async () => {
  const path = $("#task-editor-panel").dataset.path;
  $("#task-editor-status").textContent = "Saving…";
  try {
    await api("POST", "/api/tasks/detail", {
      path,
      instruction: $("#task-editor-instruction").value,
      dockerfile: $("#task-editor-dockerfile").value,
      solveSh: $("#task-editor-solve").value,
      testSh: $("#task-editor-test").value,
    });
    await api("POST", "/api/tasks/rubric-default", {
      path,
      rubricIds: $$("#task-editor-rubric-picker input:checked").map((i) => i.value),
      judgeId: $("#task-editor-judge-picker").value,
    });
    $("#task-editor-status").textContent = "Saved.";
    refreshTaskList();
  } catch (err) {
    $("#task-editor-status").textContent = "Error: " + err.message;
  }
});
$("#task-editor-close").addEventListener("click", () => { $("#task-editor-panel").hidden = true; });

