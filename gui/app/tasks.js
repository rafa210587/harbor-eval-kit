// Tasks: harbor init --task plus the in-browser editor for the four task files.
import { $, $$, api, escapeHtml } from "./core.js";
import { tabRefreshers } from "./core.js";
import { renderTaskRubricPicker } from "./judging.js";
import { SAFE_TEST_SH_TEMPLATE } from "./task-template.js";
import { createPollingGuard } from "./compare-domain.js";
import { taskFilesForSave } from "./task-domain.js";

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
  list.innerHTML = tasks.length ? "" : '<p class="muted">Nenhuma task encontrada em evals/ ou datasets/.</p>';
  for (const t of tasks) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<div class="row-main"><div class="row-title">${escapeHtml(t.path)} <span class="badge">${t.source}</span></div></div><div class="row-actions"></div>`;
    const badge = document.createElement("em");
    badge.className = "muted";
    badge.textContent = t.stub ? "task.toml ausente/incompleto" : "task.toml detectado · conteúdo não validado";
    row.querySelector(".row-actions").appendChild(badge);
    const editBtn = document.createElement("button");
    editBtn.textContent = "Editar arquivos";
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
  document.dispatchEvent(new CustomEvent("hek:tasks-refreshed", { detail: { count: tasks.length } }));
}
tabRefreshers.tasks = refreshTaskList;
$("#task-refresh").addEventListener("click", refreshTaskList);

$("#compare-task-picker").addEventListener("change", (e) => {
  $("#compare-form input[name=path]").value = e.target.value;
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

  testSh: SAFE_TEST_SH_TEMPLATE,
};

const taskEditorGuard = createPollingGuard();

async function openTaskEditor(path) {
  const token = taskEditorGuard.next();
  const panel = $("#task-editor-panel");
  $("#task-editor-path").textContent = path;
  $("#task-editor-status").textContent = "Carregando…";
  panel.hidden = false;
  delete panel.dataset.path;
  $("#task-editor-save").disabled = true;
  try {
    const files = await api("GET", `/api/tasks/detail?path=${encodeURIComponent(path)}`);
    if (!taskEditorGuard.isCurrent(token)) return;
    const rubricDefault = await api("GET", `/api/tasks/rubric-default?path=${encodeURIComponent(path)}`);
    if (!taskEditorGuard.isCurrent(token)) return;
    $("#task-editor-instruction").value = files.instruction || TASK_TEMPLATES.instruction;
    $("#task-editor-dockerfile").value = files.dockerfile || TASK_TEMPLATES.dockerfile;
    $("#task-editor-solve").value = files.solveSh ?? "";
    $("#task-editor-test").value = files.testSh || TASK_TEMPLATES.testSh;
    renderTaskRubricPicker(rubricDefault.rubricIds || []);
    $("#task-editor-judge-picker").value = rubricDefault.judgeId || "";
    panel.dataset.path = path;
    panel.dataset.solveHadContent = files.solveSh ? "1" : "0";
    $("#task-editor-save").disabled = false;
    $("#task-editor-status").textContent = "";
  } catch (err) {
    if (!taskEditorGuard.isCurrent(token)) return;
    $("#task-editor-status").textContent = "Erro: " + err.message;
  }
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

$("#task-editor-save").addEventListener("click", async () => {
  const path = $("#task-editor-panel").dataset.path;
  if (!path) return;
  const button = $("#task-editor-save");
  if (button.disabled) return;
  button.disabled = true;
  $("#task-editor-status").textContent = "Salvando…";
  let filesSaved = false;
  try {
    const files = taskFilesForSave({
      instruction: $("#task-editor-instruction").value,
      dockerfile: $("#task-editor-dockerfile").value,
      solveSh: $("#task-editor-solve").value,
      testSh: $("#task-editor-test").value,
    }, $("#task-editor-panel").dataset.solveHadContent === "1");
    await api("POST", "/api/tasks/detail", {
      path,
      ...files,
    });
    filesSaved = true;
    await api("POST", "/api/tasks/rubric-default", {
      path,
      rubricIds: $$("#task-editor-rubric-picker input:checked").map((i) => i.value),
      judgeId: $("#task-editor-judge-picker").value,
    });
    if ($("#task-editor-panel").dataset.path !== path) return;
    $("#task-editor-status").textContent = "Salvo.";
    await refreshTaskList();
  } catch (err) {
    if ($("#task-editor-panel").dataset.path !== path) return;
    $("#task-editor-status").textContent = filesSaved
      ? "Os arquivos foram salvos, mas o padrão de juiz/conjuntos de critérios falhou: " + err.message
      : "Erro ao salvar: " + err.message;
  } finally {
    if ($("#task-editor-panel").dataset.path === path) button.disabled = false;
  }
});
$("#task-editor-close").addEventListener("click", () => {
  taskEditorGuard.invalidate();
  $("#task-editor-panel").hidden = true;
  delete $("#task-editor-panel").dataset.path;
  delete $("#task-editor-panel").dataset.solveHadContent;
  $("#task-editor-save").disabled = true;
});
