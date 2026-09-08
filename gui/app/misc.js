// Trajectories (harbor view) and the standalone Analyze tab.
import { $, $$, api, tabRefreshers } from "./core.js";
import { freezeAnalysisConfig, withAnalysisSession, withBooleanField } from "./compare-domain.js";
import { renderStandaloneAnalysis } from "./analysis-render.js";
import { effectiveStandaloneCriterionSetIds } from "./judging-domain.js";
import { startOperationMonitor } from "./operation-live.js";
import { launchViewer, refreshViewList } from "./viewer-live.js";

// ================= TRAJECTORIES =================
$("#view-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  void launchViewer(data.jobsDir);
});
export { refreshViewList };
tabRefreshers.trajectories = refreshViewList;

// ================= ANALYZE =================
$("#analyze-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const rawData = Object.fromEntries(new FormData(e.target).entries());
  // FormData represents a checked checkbox as the string "on". The API deliberately requires
  // a real boolean so validation results cannot be mistaken for a high-tier judgment.
  const validationMode = $("#analyze-standalone-validation-mode").checked;
  const rubricIds = effectiveStandaloneCriterionSetIds($$("#analyze-rubric-picker input:checked").map((input) => input.value));
  let analysisConfig;
  try {
    analysisConfig = freezeAnalysisConfig({ judgeId: rawData.judgeId, rubricIds, validationMode });
  } catch (err) {
    $("#analyze-output").textContent = "Não foi possível preparar a análise: " + err.message;
    return;
  }
  let baseData = withBooleanField({ path: rawData.path, jobsDir: rawData.jobsDir, judgeId: analysisConfig.judgeId }, "validationMode", analysisConfig.validationMode);
  const criterionRuns = analysisConfig.rubricIds.map((rubricId) => ({
    rubricId,
    label: rubricId === "__default__"
      ? "padrão do Harbor"
      : $( `#analyze-rubric-picker input[value="${CSS.escape(rubricId)}"]` )?.closest("label")?.textContent?.trim() || rubricId,
  }));
  const out = $("#analyze-output");
  const button = e.target.querySelector('button[type="submit"]');
  if (button.disabled) return;
  const controls = $$('input, select, button', e.target);
  const priorDisabled = new Map(controls.map((control) => [control, control.disabled]));
  controls.forEach((control) => { control.disabled = true; });
  const originalLabel = button.textContent;
  const startedAt = Date.now();
  let position = 1;
  out.replaceChildren();
  const progress = document.createElement("p");
  progress.className = "hint status-line";
  progress.setAttribute("role", "status");
  const results = document.createElement("div");
  out.append(progress, results);
  const showProgress = () => {
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    button.textContent = `Analisando ${position}/${criterionRuns.length}… ${elapsed}s`;
    progress.textContent = `Preparando ou executando ${position}/${criterionRuns.length} há ${elapsed}s; juiz e conjuntos serão congelados para todo o lote.`;
  };
  showProgress();
  const tick = setInterval(showProgress, 1000);
  let failures = 0;
  try {
    const session = await api("POST", "/api/analysis-sessions", analysisConfig);
    analysisConfig = withAnalysisSession(analysisConfig, session);
    baseData = { ...baseData, analysisSessionId: analysisConfig.analysisSessionId };
    for (const [index, { rubricId, label }] of criterionRuns.entries()) {
      position = index + 1;
      showProgress();
      const section = document.createElement("section");
      section.className = "panel";
      const heading = document.createElement("h3");
      heading.textContent = `Conjunto: ${label}`;
      section.appendChild(heading);
      const rendered = document.createElement("div");
      section.appendChild(rendered);
      results.appendChild(section);
      const operationId = crypto.randomUUID();
      const monitor = startOperationMonitor({
        id: operationId,
        scope: "standalone-analysis",
        label: `Análise avulsa · ${heading.textContent.replace(/^Conjunto: /, "")}`,
        targetPath: baseData.path,
      });
      try {
        const res = await api("POST", "/api/analyze", { ...baseData, rubricId, operationId });
        monitor?.requestSettled({ received: true });
        renderStandaloneAnalysis(rendered, res);
      } catch (err) {
        monitor?.requestSettled({ error: err });
        failures += 1;
        const message = document.createElement("p");
        message.className = "hint status-line";
        message.style.color = "var(--err)";
        message.textContent = "Erro: " + err.message;
        rendered.appendChild(message);
      }
    }
    progress.textContent = failures
      ? `${criterionRuns.length} conjunto(s) processado(s), com ${failures} erro(s).`
      : `${criterionRuns.length} conjunto(s) analisado(s) com os mesmos inputs congelados.`;
  } catch (err) {
    progress.textContent = "Não foi possível iniciar a sessão congelada: " + err.message;
  }
  finally {
    clearInterval(tick);
    for (const [control, disabled] of priorDisabled) control.disabled = disabled;
    button.textContent = originalLabel;
  }
});
