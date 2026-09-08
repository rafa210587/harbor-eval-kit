import { escapeHtml, api } from "./core.js";
import { candidateDifferences, judgeEvaluation, resultState } from "./compare-domain.js";

export function renderEffectivePlan(box, plan) {
  if (!plan?.candidates?.length) {
    box.innerHTML = '<p class="muted">Adicione candidatos e escolha uma task para ver o plano efetivo.</p>';
    return;
  }
  const baseline = Number.isInteger(plan.baselineIndex) ? plan.baselineIndex : undefined;
  const baselineCandidate = baseline === undefined ? null : plan.candidates[baseline];
  const tasks = plan.tasks || [];
  const extra = Array.isArray(plan.extra) && plan.extra.length ? plan.extra.join(" ") : "nenhum";
  box.innerHTML = `<p><strong>${escapeHtml(plan.title || "Experimento sem título")}</strong> · ${escapeHtml(tasks.length || "?")} task(s) × ${escapeHtml(plan.nAttempts)} tentativa(s) · concorrência ${escapeHtml(plan.concurrency)}</p>` +
    `<p class="row-sub"><strong>Entrada:</strong> ${escapeHtml(plan.taskPath || "não reportada")}</p>` +
    (plan.description ? `<p class="row-sub"><strong>Pergunta:</strong> ${escapeHtml(plan.description)}</p>` : "") +
    (tasks.length > 1 ? `<details><summary>Ver ${tasks.length} tasks efetivas</summary><div class="result-details">${tasks.map((task) => `<div>${escapeHtml(task)}</div>`).join("")}</div></details>` : "") +
    `<details><summary>Ver execução efetiva</summary><div class="result-details">Jobs dir: ${escapeHtml(plan.jobsDir || "não reportado")} · ambiente: ${escapeHtml(plan.env || "não reportado")} · argumentos extras: ${escapeHtml(extra)}${plan.dryRun ? " · dry run" : ""}</div></details>` +
    plan.candidates.map((candidate, index) => {
      const skillNames = (candidate.skills || []).map((skill) => skill.label || skill.id).join(", ") || "nenhuma";
      const differences = candidateDifferences(candidate, baselineCandidate);
      const effectiveDetails = (candidate.skills || []).map((skill) => `${skill.label || skill.id} [${skill.mode}]${skill.path ? `\nCaminho: ${skill.path}` : ""}${skill.instructions ? `\n${skill.instructions}` : ""}`).join("\n\n");
      return `<div class="preview-candidate"><strong>${index + 1}. ${escapeHtml(candidate.label || candidate.id)}</strong>${index === baseline ? ' <span class="badge baseline-badge">baseline</span>' : ""}<div class="row-sub">Agente: ${escapeHtml(candidate.agent)} · Modelo: ${escapeHtml(candidate.model || "padrão do Harbor")} · Skills efetivas: ${escapeHtml(skillNames)}</div>${baselineCandidate && index !== baseline ? `<div class="row-sub">Diferenças vs baseline: ${escapeHtml(differences.join(", ") || "nenhuma")}</div>` : ""}${effectiveDetails ? `<details><summary>Ver instruções e skills efetivas</summary><pre class="output">${escapeHtml(effectiveDetails)}</pre></details>` : ""}</div>`;
    }).join("");
}

export function renderResultsTable(table, rows, plan, allowAnalysis, onAnalyze) {
  table.innerHTML = "<tr><th>Candidato</th><th>Estado</th><th>Reward médio</th><th>Avaliação do juiz</th><th>Custo reportado</th><th>Duração</th><th>Ações</th></tr>";
  rows.forEach((row, index) => {
    const tr = document.createElement("tr");
    const candidate = plan?.candidates?.find((item) => item.jobName === row.jobName) || plan?.candidates?.[index];
    const baselineCandidate = plan?.candidates?.[plan?.baselineIndex];
    const baseline = candidate && candidate === baselineCandidate ? ' <span class="badge baseline-badge">baseline</span>' : "";
    const dryRunBadge = plan?.dryRun ? ' <span class="badge dry-run-badge">dry run — sem execução</span>' : "";
    const reward = typeof row.meanReward === "number" ? row.meanReward.toFixed(3) : "Não reportado";
    const cost = typeof row.costUsd === "number" ? `$${row.costUsd.toFixed(4)}` : "Não reportado";
    const duration = typeof row.durationSec === "number" ? `${row.durationSec.toFixed(1)} s` : "Não reportado";
    const skillset = row.skillset || candidate?.skillset?.label || "nenhuma";
    tr.innerHTML = `<td><strong>${escapeHtml(candidate?.label || row.agent || row.jobName)}</strong>${baseline}${dryRunBadge}<div class="row-sub">Modelo: ${escapeHtml(row.model || candidate?.model || "não reportado")} · Skills: ${escapeHtml(skillset)}</div></td><td>${escapeHtml(resultState(row, plan?.dryRun === true))}</td><td>${escapeHtml(reward)}</td><td>${escapeHtml(judgeEvaluation(row))}</td><td>${escapeHtml(cost)}</td><td>${escapeHtml(duration)}</td>`;
    const action = document.createElement("td");
    if (plan?.jobsDir && candidate) {
      const logs = document.createElement("button");
      logs.className = "secondary";
      logs.textContent = "Logs";
      logs.title = "Abrir os arquivos reais do Harbor para este candidato";
      logs.onclick = () => document.dispatchEvent(new CustomEvent("hek:open-operation-log", { detail: { jobsDir: plan.jobsDir, job: row.jobName } }));
      action.appendChild(logs);
      const processLog = document.createElement("details");
      const processSummary = document.createElement("summary");
      processSummary.textContent = "Saída do processo";
      const processContent = document.createElement("pre");
      processContent.className = "output";
      processLog.append(processSummary, processContent);
      processLog.addEventListener("toggle", async () => {
        if (!processLog.open) return;
        processContent.textContent = "Lendo saída persistida…";
        try {
          const tail = await api("GET", `/api/experiments/${encodeURIComponent(plan.id)}/logs/${encodeURIComponent(candidate.id)}?jobsDir=${encodeURIComponent(plan.jobsDir)}`);
          processContent.textContent = tail.content || "Esta execução não tem saída de processo registrada; consulte Logs para os arquivos do Harbor.";
        } catch (err) { processContent.textContent = `Erro ao ler saída: ${err.message}`; }
      });
      action.appendChild(processLog);
    }
    if (row.ok && allowAnalysis) {
      const button = document.createElement("button");
      button.className = "secondary";
      button.textContent = row.analyses?.length ? "Re-analisar" : "Analisar";
      button.onclick = () => onAnalyze(index);
      action.appendChild(button);
    }
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Detalhes";
    const body = document.createElement("div");
    const tokens = (row.nInputTokens ?? row.nOutputTokens) ? `${row.nInputTokens ?? "não reportado"} / ${row.nOutputTokens ?? "não reportado"}` : "não reportados";
    const judge = typeof row.judgeCostUsd === "number" ? `$${row.judgeCostUsd.toFixed(4)}` : "não reportado";
    body.className = "result-details";
    body.textContent = `Job: ${row.jobName} · agente: ${row.agent || "não reportado"} · skills: ${row.skillset || "nenhuma"} · trials: ${row.nTrials ?? "não reportado"} · erros: ${row.nErrors ?? "não reportado"} · tokens entrada/saída: ${tokens} · custo juiz: ${judge}${row.error ? ` · erro real: ${row.error}` : ""}`;
    details.append(summary, body);
    action.appendChild(details);
    tr.appendChild(action);
    table.appendChild(tr);
  });
}
