// Compare: the core tab -- builds the entry rows, runs the comparison, renders results and
// drives the optional judge analysis.
import { $, $$, api, escapeHtml, checkboxGroup } from "./core.js";
import { state, onRefresh, guessProviderKey } from "./state.js";
import { renderComparRubricPicker } from "./judging.js";

// ================= COMPARE =================
function renderCompareAgentPicker() {
  const sel = $("#compare-agent-picker");
  sel.innerHTML = state.agents.length
    ? state.agents.map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.label)}</option>`).join("")
    : '<option value="">nenhum agent cadastrado — vá em "Agents"</option>';
}

function updateCompareEntriesCount() {
  const n = $$("#compare-entries-list > .entry-row").length;
  $("#combo-counter").textContent = `${n} entrada${n === 1 ? "" : "s"} adicionada${n === 1 ? "" : "s"}.`;
}

function addCompareEntryRow(agentId) {
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) return;

  const row = document.createElement("div");
  row.className = "panel entry-row";
  row.dataset.agentId = agentId;
  row.style.marginBottom = "10px";

  const modelOptions = state.models.map((m) => {
    const key = guessProviderKey(m.value);
    const missing = key && !state.secretNames.includes(key) ? ` — falta ${key}` : "";
    return `<option value="${escapeHtml(m.id)}" ${m.id === agent.modelId ? "selected" : ""}>${escapeHtml(m.label)}${missing}</option>`;
  }).join("");

  row.innerHTML = `
    <div class="row-title">${escapeHtml(agent.label)} <span class="badge">${escapeHtml(agent.agentValue)}</span></div>
    <label>Model <span class="hint" style="display:inline;margin:0;">— pré-preenchido com o padrão do agent, sobrescreva se quiser.</span></label>
    <select class="entry-model"><option value="">— nenhum (usa o padrão do Harbor) —</option>${modelOptions}</select>
    <label>Skill sets</label>
    <div class="checkbox-group entry-skillsets"></div>
    <button class="secondary" type="button" style="margin-top:8px;">Remover esta entrada</button>
  `;
  checkboxGroup(row.querySelector(".entry-skillsets"), state.skillsets, {
    name: `entry-skillsets-${state.agents.indexOf(agent)}-${Date.now()}`,
    checkedIds: agent.defaultSkillsetIds ?? [],
  });
  row.querySelector("button").addEventListener("click", () => {
    row.remove();
    updateCompareEntriesCount();
  });

  $("#compare-entries-list").appendChild(row);
  updateCompareEntriesCount();
}

$("#compare-add-entry-btn").addEventListener("click", () => {
  const agentId = $("#compare-agent-picker").value;
  if (!agentId) { alert("Cadastre um agent primeiro, na aba Agents."); return; }
  addCompareEntryRow(agentId);
  refreshCostEstimate();
});

/** Reads the rows currently on screen, in the shape both the estimate and the run expect. */
function currentEntries() {
  return $$("#compare-entries-list > .entry-row").map((row) => ({
    agentId: row.dataset.agentId,
    modelId: row.querySelector(".entry-model").value || undefined,
    skillsetIds: $$("input:checked", row.querySelector(".entry-skillsets")).map((i) => i.value),
  }));
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
  if (entries.length === 0) { el.textContent = "—"; el.style.color = ""; return; }
  try {
    const est = await api("POST", "/api/compare/estimate", {
      entries,
      nAttempts: form.elements["nAttempts"].value || "1",
      jobsDir: form.elements["jobsDir"].value || "jobs",
    });
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
    el.textContent = "—";
    el.style.color = "";
  }
}

// Anything that changes the size of the run re-prices it.
$("#compare-form").addEventListener("input", (e) => {
  if (["nAttempts", "costCapUsd", "jobsDir"].includes(e.target.name) || e.target.classList.contains("entry-model")) {
    refreshCostEstimate();
  }
});
$("#compare-form").addEventListener("change", (e) => {
  if (e.target.classList.contains("entry-model")) refreshCostEstimate();
});

let lastCompareJobsDir = null;
let lastCompareRows = [];

const COMPARE_COL_LABELS = {
  jobName: "jobName", agent: "agent", model: "model", skillset: "skillset", ok: "ok",
  nTrials: "nTrials", nErrors: "nErrors", meanReward: "meanReward", durationSec: "durationSec (s)",
  costUsd: "custo agent (USD)", tokens: "tokens in/out", passRate: "passRate", judgeCostUsd: "custo juiz (USD)", error: "error",
};

function renderCompareTable() {
  const table = $("#compare-table");
  const cols = ["jobName", "agent", "model", "skillset", "ok", "nTrials", "nErrors", "meanReward", "durationSec", "costUsd", "tokens", "passRate", "judgeCostUsd", "error"];
  table.innerHTML = "";
  const headRow = document.createElement("tr");
  headRow.innerHTML = cols.map((c) => `<th>${COMPARE_COL_LABELS[c]}</th>`).join("") + "<th></th>";
  table.appendChild(headRow);
  lastCompareRows.forEach((r, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = cols.map((c) => {
      let v;
      if (c === "passRate") v = r.passRate !== undefined ? r.passRate.toFixed(2) : "";
      else if (c === "costUsd") v = typeof r.costUsd === "number" ? `$${r.costUsd.toFixed(4)}` : "";
      else if (c === "judgeCostUsd") v = typeof r.judgeCostUsd === "number" ? `$${r.judgeCostUsd.toFixed(4)}` : "";
      else if (c === "tokens") v = (r.nInputTokens ?? r.nOutputTokens) ? `${r.nInputTokens ?? "?"} / ${r.nOutputTokens ?? "?"}` : "";
      else v = r[c];
      return `<td>${escapeHtml(v)}</td>`;
    }).join("");
    const actionTd = document.createElement("td");
    if (r.ok) {
      const btn = document.createElement("button");
      btn.className = "secondary";
      btn.textContent = (r.analyses && r.analyses.length) ? "Re-analisar" : "Analisar";
      btn.onclick = () => analyzeRow(idx);
      actionTd.appendChild(btn);
    }
    tr.appendChild(actionTd);
    table.appendChild(tr);
  });
}

async function analyzeRow(idx) {
  const row = lastCompareRows[idx];
  const judgeId = $("#compare-judge-picker").value;
  if (!judgeId) { alert('Escolha um Judge primeiro (cadastre um na aba "Judges" se a lista estiver vazia).'); return; }
  const checkedRubricIds = $$("#compare-rubric-picker input:checked").map((i) => i.value);
  const rubricRuns = checkedRubricIds.length > 0 ? checkedRubricIds : ["__default__"];
  const resultsEl = $("#compare-analysis-results");
  const path = `${lastCompareJobsDir}/${row.jobName}`;

  row.analyses = row.analyses || [];
  let totalPass = 0;
  let totalApplicable = 0;
  let totalJudgeCostUsd = 0;
  const block = document.createElement("div");
  block.className = "panel";
  block.innerHTML = `<div class="row-title">${escapeHtml(row.jobName)}</div>`;

  for (const rubricId of rubricRuns) {
    const rubricLabel = rubricId === "__default__"
      ? "padrão do Harbor"
      : state.rubrics.find((r) => r.id === rubricId)?.label || rubricId;
    try {
      const validationMode = $("#analyze-validation-mode") ? $("#analyze-validation-mode").checked : false;
      const res = await api("POST", "/api/analyze", { path, rubricId, judgeId, validationMode });
      const analysis = res.analysis;
      if (res.validationMode) {
        block.innerHTML += `<p class="hint" style="color:var(--warn);">⚠ Modo validação: julgado por <code>${escapeHtml(res.judgeModel || "?")}</code>, que está fora da lista curada high-tier. Serve pra confirmar que o pipeline roda — <strong>não</strong> vale como avaliação.</p>`;
      }
      row.analyses.push({ rubricLabel, analysis });
      const cost = analysis && typeof analysis.estimated_cost_usd === "number" ? analysis.estimated_cost_usd : null;
      if (cost !== null) totalJudgeCostUsd += cost;
      const checksHtml = analysis && analysis.checks
        ? Object.entries(analysis.checks).map(([name, c]) => {
            if (c.outcome === "pass") totalPass++;
            if (c.outcome !== "not_applicable") totalApplicable++;
            return `<div class="row-sub"><strong>${escapeHtml(name)}</strong>: ${escapeHtml(c.outcome)} — ${escapeHtml(c.explanation)}</div>`;
          }).join("")
        : `<pre class="output">${escapeHtml(res.stdout || res.stderr || "(sem analysis.json legível — veja stdout bruto)")}</pre>`;
      block.innerHTML += `<h3 class="step">${escapeHtml(rubricLabel)}</h3>` +
        (analysis && analysis.summary ? `<p class="hint">${escapeHtml(analysis.summary)}</p>` : "") +
        checksHtml +
        (cost !== null ? `<p class="hint">Custo do juiz nesta análise: $${cost.toFixed(4)}</p>` : "");
    } catch (err) {
      block.innerHTML += `<h3 class="step">${escapeHtml(rubricLabel)}</h3><p class="hint">Erro: ${escapeHtml(err.message)}</p>`;
    }
  }

  row.passRate = totalApplicable > 0 ? totalPass / totalApplicable : undefined;
  row.judgeCostUsd = (row.judgeCostUsd || 0) + totalJudgeCostUsd;
  resultsEl.prepend(block);
  renderCompareTable();
}

$("#compare-analyze-all-btn").addEventListener("click", async () => {
  for (let i = 0; i < lastCompareRows.length; i++) {
    if (lastCompareRows[i].ok) await analyzeRow(i);
  }
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

$("#compare-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const entries = currentEntries();
  if (entries.length === 0) { alert("Adicione ao menos uma entrada (agent) pra comparar."); return; }
  const jobsDir = fd.get("jobsDir") || "jobs";
  const body = {
    path: fd.get("path"),
    entries,
    env: fd.get("env") || "docker",
    jobPrefix: fd.get("jobPrefix") || "cmp",
    jobsDir,
    nAttempts: fd.get("nAttempts") || "1",
    concurrency: fd.get("concurrency") || "1",
    dryRun: fd.get("dryRun") === "on",
    extra: fd.get("extra") || "",
    costCapUsd: fd.get("costCapUsd") || "0",
    // Generated here, not by the server: the browser must know this id before the POST below
    // resolves, or there would be no way to call /api/compare/cancel while it's in flight.
    runId: crypto.randomUUID(),
  };
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
  const liveStop = body.dryRun ? null : startCompareLiveLog(jobsDir);

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
    lastCompareJobsDir = jobsDir;
    lastCompareRows = result.rows;
    renderCompareTable();
    // A reused job dir means Harbor did not re-run that combination -- the row is the OLD
    // result, read back. Silently that looks like a fresh comparison, so say it out loud.
    const reused = result.reusedJobs ?? [];
    out.textContent = `Pronto. Relatório: ${result.reportCsv}` +
      (reused.length
        ? `\n⚠ ${reused.length} job(s) já existiam com este "Job prefix" e foram reaproveitados pelo Harbor ` +
          `em vez de rodar de novo — os números dessas linhas são da run anterior. ` +
          `Use outro "Job prefix" para uma comparação realmente nova.`
        : "");
    $("#compare-post-actions").hidden = false;
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

// Tails whichever job dir harbor touched most recently while a Compare run is in flight. The
// job name isn't known to the page in advance (the server derives it from the combo), so it
// follows "newest job dir" rather than a name -- good enough for a progress view, and the Logs
// tab is there for picking a specific job/file deliberately.
function startCompareLiveLog(jobsDir) {
  const box = $("#compare-live");
  const pre = $("#compare-live-log");
  box.hidden = false;
  pre.textContent = "";
  let job = null;
  let file = null;
  let offset = 0;
  const timer = setInterval(async () => {
    try {
      if (!job) {
        const jobs = await api("GET", `/api/logs/jobs?jobsDir=${encodeURIComponent(jobsDir)}`);
        const running = jobs.find((j) => j.running) || jobs[0];
        if (!running) return;
        job = running.name;
      }
      if (!file) {
        const files = await api("GET", `/api/logs/files?jobsDir=${encodeURIComponent(jobsDir)}&job=${encodeURIComponent(job)}`);
        file = files.find((f) => f.endsWith("trial.log")) || files.find((f) => f === "job.log") || files[0];
        if (!file) return;
      }
      const tail = await api(
        "GET",
        `/api/logs/tail?jobsDir=${encodeURIComponent(jobsDir)}&job=${encodeURIComponent(job)}&file=${encodeURIComponent(file)}&offset=${offset}`
      );
      if (tail.content) { pre.textContent += tail.content; pre.scrollTop = pre.scrollHeight; }
      offset = tail.nextOffset;
    } catch { /* job dir not created yet, or file rotated -- next tick retries */ }
  }, 2000);
  return () => clearInterval(timer);
}


// Registered with the refresh cycle instead of being called by name from state.js --
// see the note at the top of state.js.
onRefresh(() => { renderCompareAgentPicker(); });
