import { $, api, escapeHtml } from "./core.js";
import { state } from "./state.js";
import { analysisOutcome } from "./analysis-view.js";

export async function analyzeCompareRow(row, jobsDir, experimentId, renderTable, batchConfig) {
  const analysisBatchId = crypto.randomUUID();
  const judgeId = batchConfig.judgeId;
  if (!judgeId) { alert("Escolha um juiz primeiro; cadastre um em Juízes se a lista estiver vazia."); return; }
  const rubricRuns = batchConfig.rubricIds;
  const resultsEl = $("#compare-analysis-results");
  const path = `${jobsDir}/${row.jobName}`;

  row.analyses = row.analyses || [];
  let totalPass = 0;
  let totalApplicable = 0;
  let totalJudgeCostUsd = 0;
  let costComplete = true;
  let scoreComplete = true;
  let failures = 0;
  const block = document.createElement("div");
  block.className = "panel";
  block.innerHTML = `<div class="row-title">${escapeHtml(row.jobName)}</div>`;

  for (const [analysisBatchIndex, rubricId] of rubricRuns.entries()) {
    const rubricLabel = rubricId === "__default__"
      ? "padrão do Harbor"
      : state.rubrics.find((r) => r.id === rubricId)?.label || rubricId;
    try {
      const validationMode = batchConfig.validationMode;
      const res = await api("POST", "/api/analyze", { path, rubricId, judgeId, validationMode, analysisSessionId: batchConfig.analysisSessionId, experimentId: experimentId, jobName: row.jobName, jobsDir, analysisBatchId, analysisBatchIndex, analysisBatchSize: rubricRuns.length });
      const analysis = res.analysis;
      if (res.validationMode) {
        block.innerHTML += `<p class="hint persistent-hint" style="color:var(--warn);">⚠ Modo validação: julgado por <code>${escapeHtml(res.judgeModel || "?")}</code>, que está fora da lista curada high-tier. Serve para confirmar que o pipeline roda; <strong>não</strong> vale como avaliação.</p>`;
      }
      row.analyses.push({ ok: res.ok, analysisBatchId, rubricId, rubricLabel, judgeId, judgeModel: res.judgeModel, validationMode: !!res.validationMode, analysis });
      const aggregate = analysis?.aggregate;
      if (res.validationMode || !aggregate || aggregate.unknown > 0 || aggregate.incompleteTrials > 0) scoreComplete = false;
      const cost = aggregate?.costUsd;
      if (typeof cost === "number") totalJudgeCostUsd += cost;
      else costComplete = false;
      totalPass += aggregate?.pass ?? 0;
      totalApplicable += aggregate?.applicable ?? 0;
      const trials = analysis?.results ?? (analysis ? [analysis] : []);
      block.innerHTML += '<h3 class="step">' + escapeHtml(rubricLabel) + '</h3>';
      for (const [trialIndex, trial] of trials.entries()) {
        block.innerHTML += '<h4>Trial ' + (trialIndex + 1) + ' — ' + escapeHtml(trial.trial_name || trial.trial_path || '') + '</h4>' +
          (trial.summary ? '<p class="analysis-summary">' + escapeHtml(trial.summary) + '</p>' : '') +
          Object.entries(trial.checks || {}).map(([name, check]) => {
            const outcome = analysisOutcome(check?.outcome);
            return '<div class="analysis-check"><span class="badge outcome-' + outcome.kind + '">' + outcome.label + '</span><div><strong>' + escapeHtml(name) + '</strong>' + (check?.explanation ? '<p class="row-sub">' + escapeHtml(check.explanation) + '</p>' : '') + '</div></div>';
          }).join('');
      }
      if (aggregate?.incompleteTrials > 0) block.innerHTML += `<p class="hint persistent-hint" style="color:var(--warn);">⚠ ${escapeHtml(aggregate.incompleteTrials)} trial(s) sem checks completos; nenhuma nota foi calculada.</p>`;
      if (!trials.length) block.innerHTML += '<pre class="output">' + escapeHtml(res.stdout || res.stderr || '(sem analysis.json legível)') + '</pre>';
      block.innerHTML += typeof cost === "number"
        ? '<p class="hint status-line">Custo do juiz nesta análise: $' + cost.toFixed(4) + '</p>'
        : '<p class="hint status-line">Custo total do juiz não reportado para todos os trials.</p>';
    } catch (err) {
      failures += 1;
      costComplete = false;
      scoreComplete = false;
      row.analyses.push({ ok: false, error: err.message, analysisBatchId, rubricId, rubricLabel, judgeId, validationMode: batchConfig.validationMode, analysis: null });
      block.innerHTML += `<h3 class="step">${escapeHtml(rubricLabel)}</h3><p class="hint status-line" style="color:var(--err);">Erro: ${escapeHtml(err.message)}</p>`;
    }
  }

  row.passRate = scoreComplete && totalApplicable > 0 ? totalPass / totalApplicable : undefined;
  row.judgeCostUsd = costComplete ? totalJudgeCostUsd : undefined;
  resultsEl.prepend(block);
  renderTable();
  return { failures };
}
