// Compare: the core tab -- builds the entry rows, runs the comparison, renders results and
// drives the optional judge analysis.
import { $, $$, api, escapeHtml, checkboxGroup } from "./core.js";
import { state, onRefresh, guessProviderKey } from "./state.js";
import { renderComparRubricPicker } from "./judging.js";
import { rememberExperiment, setupExperimentHistory } from "./compare-history.js";
import { baselineIndex, cloneCandidate, createPollingGuard, experimentDownloadUrl } from "./compare-domain.js";
import { describeField } from "./field-help.js";
import { renderEffectivePlan, renderResultsTable } from "./compare-render.js";
import { startCompareLiveLog } from "./compare-live.js";
import { setupCompareAnalysis } from "./compare-analysis-controller.js";

// ================= COMPARE =================
const MODE_HELP = {
  models: "Finalidade: manter o mesmo agente e as mesmas skills enquanto você varia o modelo. Exemplo: DeepSeek Flash contra Pro. Padrão: Comparar modelos. Obrigatório para orientar a montagem; não altera o Harbor sozinho.",
  agents: "Finalidade: comparar perfis de agente na mesma task. Exemplo: mini-swe-agent contra aider, com o mesmo modelo quando compatível. Padrão: nenhum preenchimento automático. Obrigatório para orientar a montagem.",
  skills: "Finalidade: medir o efeito de skills. Exemplo: uma baseline sem skills e sua duplicata com Python engineering. Padrão: marque a linha sem skills como baseline. Obrigatório para orientar a montagem.",
  free: "Finalidade: montar combinações com mais de uma dimensão diferente. Exemplo: agente, modelo e skills variando juntos. Padrão: nenhuma restrição adicional; confira todas as diferenças na prévia. Obrigatório para orientar a montagem.",
};
$("#compare-mode").addEventListener("change", (event) => { $("#compare-mode-help").textContent = MODE_HELP[event.target.value]; });

function renderCompareAgentPicker() {
  const sel = $("#compare-agent-picker");
  sel.innerHTML = state.agents.length
    ? state.agents.map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.label)}</option>`).join("")
    : '<option value="">nenhum agente cadastrado — abra Agentes</option>';
}

function updateCompareEntriesCount() {
  const n = $$("#compare-entries-list > .entry-row").length;
  $("#combo-counter").textContent = `${n} entrada${n === 1 ? "" : "s"} adicionada${n === 1 ? "" : "s"}.`;
}

function addCompareEntryRow(agentId, preset = null) {
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) return;

  const row = document.createElement("div");
  row.className = "panel entry-row";
  row.dataset.agentId = agentId;
  row.style.marginBottom = "10px";
  const rowUid = crypto.randomUUID();

  const modelOptions = state.models.map((m) => {
    const key = guessProviderKey(m.value);
    const missing = key && !state.secretNames.includes(key) ? ` — falta ${key}` : "";
    return `<option value="${escapeHtml(m.id)}" ${m.id === agent.modelId ? "selected" : ""}>${escapeHtml(m.label)}${missing}</option>`;
  }).join("");

  row.innerHTML = `
    <div class="row-title">${escapeHtml(agent.label)} <span class="badge">${escapeHtml(agent.agentValue)}</span></div>
    <label>Modelo <span class="hint" style="display:inline;margin:0;">— pré-preenchido com o padrão do agente; altere para isolar o efeito do modelo.</span></label>
    <select class="entry-model" aria-label="Modelo do candidato"><option value="">— nenhum (usa o padrão do Harbor) —</option>${modelOptions}</select>
    <label id="candidate-skills-label-${rowUid}">Conjuntos de skills</label>
    <div class="checkbox-group entry-skillsets" role="group" aria-labelledby="candidate-skills-label-${rowUid}" aria-describedby="candidate-skills-help-${rowUid}"></div>
    <p id="candidate-skills-help-${rowUid}" class="hint">Anexa skills a este candidato. Ex.: Engenharia Python. Padrão: conjuntos do perfil; opcional.</p>
    <div class="candidate-actions">
      <label class="checkbox-inline"><input class="entry-baseline" type="checkbox"> Usar como baseline</label>
      <button class="secondary duplicate-entry" type="button">Duplicar candidato</button>
      <button class="secondary remove-entry" type="button">Remover candidato</button>
    </div>
  `;
  checkboxGroup(row.querySelector(".entry-skillsets"), state.skillsets, {
    name: `entry-skillsets-${state.agents.indexOf(agent)}-${Date.now()}`,
    checkedIds: preset?.skillsetIds ?? agent.defaultSkillsetIds ?? [],
  });
  if (preset?.modelId !== undefined) row.querySelector(".entry-model").value = preset.modelId;
  row.querySelector(".entry-baseline").checked = preset?.baseline === true;
  row.querySelector(".entry-baseline").addEventListener("change", (event) => {
    if (event.target.checked) $$(".entry-baseline").filter((input) => input !== event.target).forEach((input) => { input.checked = false; });
    refreshCostEstimate();
  });
  row.querySelector(".duplicate-entry").addEventListener("click", () => {
    const source = readEntryRow(row);
    addCompareEntryRow(source.agentId, cloneCandidate(source));
    refreshCostEstimate();
  });
  row.querySelector(".remove-entry").addEventListener("click", () => {
    row.remove();
    updateCompareEntriesCount();
    refreshCostEstimate();
  });

  $("#compare-entries-list").appendChild(row);
  describeField(row.querySelector(".entry-model"), "Escolhe o modelo deste candidato. Ex.: deepseek/deepseek-chat. Padrão: modelo do perfil; deixe vazio para usar o padrão do Harbor.");
  describeField(row.querySelector(".entry-baseline"), "Marca este candidato como referência visual. Padrão: desligado; opcional e sem significado estatístico.");
  updateCompareEntriesCount();
}

$("#compare-add-entry-btn").addEventListener("click", () => {
  const agentId = $("#compare-agent-picker").value;
  if (!agentId) { alert("Cadastre um perfil primeiro em Agentes."); return; }
  addCompareEntryRow(agentId);
  refreshCostEstimate();
});

/** Reads the rows currently on screen, in the shape both the estimate and the run expect. */
function readEntryRow(row) {
  return {
    agentId: row.dataset.agentId,
    modelId: row.querySelector(".entry-model").value,
    skillsetIds: $$("input:checked", row.querySelector(".entry-skillsets")).map((i) => i.value),
    baseline: row.querySelector(".entry-baseline").checked,
  };
}

function currentEntries() {
  return $$("#compare-entries-list > .entry-row").map(readEntryRow);
}

const estimateGuard = createPollingGuard();

function requestEntries(entries) {
  return entries.map(({ baseline: _baseline, ...entry }) => entry);
}

function renderEffectivePreview(plan) {
  const box = $("#effective-preview");
  if (box) renderEffectivePlan(box, plan);
}

/**
 * Shows what this comparison is about to cost, before the user commits to it. Same estimator
 * the server-side guard uses, so the number on screen is the number that will be enforced.
 */
async function refreshCostEstimate() {
  const el = $("#cost-estimate");
  if (!el) return;
  const form = $("#compare-form");
  const entries = currentEntries();
  const token = estimateGuard.next();
  if (entries.length === 0) { el.textContent = "—"; el.style.color = ""; renderEffectivePreview(null); return; }
  try {
    const est = await api("POST", "/api/compare/estimate", {
      entries: requestEntries(entries),
      path: form.elements["path"].value,
      extra: form.elements["extra"].value,
      nAttempts: form.elements["nAttempts"].value || "1",
      concurrency: form.elements["concurrency"].value || "1",
      jobsDir: form.elements["jobsDir"].value || "jobs",
      title: form.elements["title"]?.value || "",
      description: form.elements["description"]?.value || "",
      baselineIndex: baselineIndex(entries),
    });
    if (!estimateGuard.isCurrent(token)) return;
    renderEffectivePreview(est.plan);
    const cap = Number(form.elements["costCapUsd"].value) || 0;
    const semHistorico = est.unknown.length
      ? ` · sem histórico para ${est.unknown.join(", ")} — o valor é um piso, não o total`
      : "";
    if (est.estimateUsd === null) {
      el.textContent = `não estimável ainda (${est.totalTrials} trial(s)) — rode uma vez para aprender o custo`;
      el.style.color = "var(--warn)";
      return;
    }
    el.textContent = `~$${est.estimateUsd.toFixed(4)} em ${est.totalTrials} trial(s)${semHistorico}`;
    el.style.color = cap > 0 && est.estimateUsd > cap ? "var(--warn)" : "var(--ok)";
  } catch {
    if (!estimateGuard.isCurrent(token)) return;
    el.textContent = "Preencha uma task/dataset válido para estimar o volume e custo.";
    el.style.color = "";
  }
}

// Anything that changes the size of the run re-prices it.
$("#compare-form").addEventListener("input", (e) => {
  if (["path", "extra", "nAttempts", "concurrency", "costCapUsd", "jobsDir", "title", "description"].includes(e.target.name) || e.target.classList.contains("entry-model")) {
    refreshCostEstimate();
  }
});
$("#compare-form").addEventListener("change", (e) => {
  if (e.target.classList.contains("entry-model") || e.target.id === "compare-task-picker") refreshCostEstimate();
});
$("#compare-entries-list").addEventListener("change", refreshCostEstimate);
for (const id of ["compare-title", "compare-description"]) $("#" + id).addEventListener("input", refreshCostEstimate);
$("#compare-preview-btn").addEventListener("click", refreshCostEstimate);

let lastExperimentId = null;
let lastCompareJobsDir = null;
let lastCompareRows = [];
let lastComparePlan = null;
let allowAnalysis = false;
let compareAnalysis;

function renderCompareTable() {
  renderResultsTable($("#compare-table"), lastCompareRows, lastComparePlan, allowAnalysis, (index) => compareAnalysis.analyzeRow(index));
}

compareAnalysis = setupCompareAnalysis({
  getRows: () => lastCompareRows,
  getJobsDir: () => lastCompareJobsDir,
  getExperimentId: () => lastExperimentId,
  renderTable: renderCompareTable,
});

$("#compare-sort-btn").addEventListener("click", () => {
  lastCompareRows.sort((a, b) => (b.passRate ?? -1) - (a.passRate ?? -1));
  renderCompareTable();
});

$("#compare-view-btn").addEventListener("click", async () => {
  if (!lastCompareJobsDir) return;
  try {
    const res = await api("POST", "/api/view", { jobsDir: lastCompareJobsDir });
    if (res.url) window.open(res.url, "_blank");
    else alert("Viewer iniciado, mas nenhuma URL detectada em 8s ainda.");
  } catch (err) { alert(err.message); }
});

function updateDownloadLinks() {
  const visible = !!lastExperimentId && !!lastCompareJobsDir;
  for (const [id, format] of [["compare-download-csv", "csv"], ["compare-download-json", "json"]]) {
    const link = $(`#${id}`);
    if (!link) continue;
    link.hidden = !visible;
    if (visible) link.href = experimentDownloadUrl(lastCompareJobsDir, lastExperimentId, format);
  }
}

$("#compare-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const entries = currentEntries();
  if (entries.length === 0) { alert("Adicione ao menos uma entrada (agent) pra comparar."); return; }
  const jobsDir = fd.get("jobsDir") || "jobs";
  const body = {
    path: fd.get("path"),
    entries: requestEntries(entries),
    env: fd.get("env") || "docker",
    jobPrefix: fd.get("jobPrefix") || "cmp",
    jobsDir,
    nAttempts: fd.get("nAttempts") || "1",
    concurrency: fd.get("concurrency") || "1",
    dryRun: fd.get("dryRun") === "on",
    extra: fd.get("extra") || "",
    costCapUsd: fd.get("costCapUsd") || "0",
    title: fd.get("title") || "",
    description: fd.get("description") || "",
    baselineIndex: baselineIndex(entries),
    // Generated here, not by the server: the browser must know this id before the POST below
    // resolves, or there would be no way to call /api/compare/cancel while it's in flight.
    runId: crypto.randomUUID(),
  };
  rememberExperiment(jobsDir, body.runId);
  allowAnalysis = false;
  const out = $("#compare-output");
  $("#compare-table").innerHTML = "";
  $("#compare-post-actions").hidden = true;
  $("#compare-analyze-panel").hidden = true;
  $("#compare-analysis-results").innerHTML = "";


  // A real run takes minutes and the POST only answers at the very end, so without this the
  // page looks frozen and a second click would fire a second harbor run into the same job
  // name. Disable the button, show elapsed time, and tail the job's log while we wait.
  const submitBtn = $("#compare-submit-btn");
  const cancelBtn = $("#compare-cancel-btn");
  const startedAt = Date.now();
  submitBtn.disabled = true;
  const originalLabel = submitBtn.textContent;
  submitBtn.textContent = "Rodando…";
  if (!body.dryRun) cancelBtn.hidden = false;
  let cancelRequested = false;
  const onCancelClick = async () => {
    cancelRequested = true;
    cancelBtn.disabled = true;
    cancelBtn.textContent = "Cancelando…";
    try {
      const r = await api("POST", "/api/compare/cancel", { runId: body.runId });
      out.textContent = `Cancelamento pedido: ${r.note}`;
    } catch (err) {
      out.textContent = "Cancelamento não teve efeito (a run provavelmente já tinha terminado): " + err.message;
    }
  };
  cancelBtn.addEventListener("click", onCancelClick);
  const tick = setInterval(() => {
    const secs = Math.round((Date.now() - startedAt) / 1000);
    if (!cancelRequested) {
      out.textContent = `Rodando há ${Math.floor(secs / 60)}m${String(secs % 60).padStart(2, "0")}s… ${body.dryRun ? "(dry run)" : "pode demorar — acompanhe o log abaixo, na aba Logs, ou cancele ao lado."}`;
    }
  }, 1000);
  out.textContent = "Rodando…";
  const liveStop = body.dryRun ? null : startCompareLiveLog(jobsDir, body.runId, {
    onRecord: (record) => {
      lastCompareRows = record.rows;
      lastComparePlan = record.plan;
      renderCompareTable();
    },
  });

  try {
    // The spend guard answers 409 before spawning anything. Offer the choice here instead of
    // making the user re-fill the form -- the acknowledgement applies to this one run and is
    // never remembered, so the guard cannot quietly stop guarding.
    let result;
    try {
      result = await api("POST", "/api/compare", body);
    } catch (err) {
      if (!/teto de \$|às cegas/.test(err.message)) throw err;
      if (!confirm(`Guarda de gasto:\n\n${err.message}\n\nRodar assim mesmo?`)) {
        out.textContent = "Cancelado pela guarda de gasto — nada foi executado.";
        return;
      }
      result = await api("POST", "/api/compare", { ...body, acknowledgeCost: true });
    }
    lastExperimentId = result.experimentId ?? null;
    lastCompareJobsDir = jobsDir;
    // The canonical plan lives in the persisted record. Read it back so the final table and
    // baseline never fall back to form values that may omit effective skills/instructions.
    const completedRecord = await api("GET", `/api/experiments/${encodeURIComponent(result.experimentId)}?jobsDir=${encodeURIComponent(jobsDir)}`);
    lastCompareRows = completedRecord.rows;
    lastComparePlan = completedRecord.plan;
    allowAnalysis = !body.dryRun;
    renderCompareTable();
    out.textContent = body.dryRun
      ? `Dry run ${result.experimentId} concluído: configuração validada, nenhum trial executado.`
      : `Experimento ${result.experimentId}. Relatório: ${result.reportCsv}`;
    $("#compare-post-actions").hidden = body.dryRun;
    updateDownloadLinks();
    if (!body.dryRun && lastCompareRows.some((r) => r.ok)) {
      $("#compare-analyze-panel").hidden = false;
      try {
        const rubricDefault = await api("GET", `/api/tasks/rubric-default?path=${encodeURIComponent(body.path)}`);
        renderComparRubricPicker(rubricDefault.rubricIds || []);
        $("#compare-judge-picker").value = rubricDefault.judgeId || "";
      } catch { /* no pinned default for this task path -- leave picker empty, that's fine */ }
    }
  } catch (err) {
    out.textContent = "Erro: " + err.message;
  } finally {
    clearInterval(tick);
    if (liveStop) liveStop();
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
    cancelBtn.hidden = true;
    cancelBtn.disabled = false;
    cancelBtn.textContent = "Cancelar";
    cancelBtn.removeEventListener("click", onCancelClick);
  }
});

// Registered with the refresh cycle instead of being called by name from state.js --
// see the note at the top of state.js.
onRefresh(() => { renderCompareAgentPicker(); });

setupExperimentHistory(record => {
  if ($("#compare-submit-btn").disabled || compareAnalysis.isRunning()) return;
  lastExperimentId = record.plan.id;
  lastCompareJobsDir = record.plan.jobsDir;
  lastCompareRows = record.rows;
  lastComparePlan = record.plan;
  allowAnalysis = !record.plan.dryRun && record.status !== "running";
  renderCompareTable();
  renderEffectivePreview(record.plan);
  updateDownloadLinks();
  $("#compare-post-actions").hidden = record.plan.dryRun || !record.rows.length;
  $("#compare-analyze-panel").hidden = record.plan.dryRun || record.status === "running" || !record.rows.some(r => r.ok);
  $("#compare-output").textContent = `Experimento ${record.plan.id} · ${record.status} · ${record.rows.length}/${record.plan.candidates.length} candidatos com resultado`;
  if (record.status === "running") startCompareLiveLog(record.plan.jobsDir, record.plan.id, {
    reconnect: true,
    canCancel: record.canCancel === true,
    onRecord: (current) => {
      lastCompareRows = current.rows;
      lastComparePlan = current.plan;
      renderCompareTable();
      renderEffectivePreview(current.plan);
    },
    onTerminal: (current) => {
      allowAnalysis = !current.plan.dryRun;
      $("#compare-analyze-panel").hidden = current.plan.dryRun || !current.rows.some((row) => row.ok);
      updateDownloadLinks();
    },
  });
  const target = $("#compare-analysis-results");
  target.textContent = "";
  for (const [job, analyses] of Object.entries(record.analyses || {})) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = `${job} — ${analyses.length} análise(s) preservada(s)`;
    const pre = document.createElement("pre"); pre.className = "output"; pre.textContent = JSON.stringify(analyses, null, 2);
    details.append(summary, pre); target.append(details);
  }
});
