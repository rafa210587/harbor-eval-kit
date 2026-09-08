import { $, $$, api } from "./core.js";
import { freezeAnalysisConfig, withAnalysisSession } from "./compare-domain.js";
import { analyzeCompareRow } from "./compare-analysis.js";

export function setupCompareAnalysis({ getRows, getJobsDir, getExperimentId, renderTable }) {
  let analyzing = false;
  const capture = () => freezeAnalysisConfig({
    judgeId: $("#compare-judge-picker").value,
    rubricIds: $$("#compare-rubric-picker input:checked").map((input) => input.value),
    validationMode: $("#analyze-validation-mode").checked,
  });
  const lock = (locked) => {
    for (const selector of ["#compare-analyze-all-btn", "#compare-submit-btn", "#compare-sort-btn", "#compare-judge-picker", "#analyze-validation-mode"]) $(selector).disabled = locked;
    $$("#compare-rubric-picker input, #compare-table button").forEach((input) => { input.disabled = locked; });
  };
  const analyzeRow = async (index) => {
    if (analyzing) return;
    let config;
    try { config = capture(); } catch (err) { alert(err.message); return; }
    analyzing = true;
    lock(true);
    const startedAt = Date.now(), progress = $("#compare-analysis-progress");
    const show = () => { progress.textContent = `Analisando 1/1 · ${Math.round((Date.now() - startedAt) / 1000)}s. Os detalhes serão adicionados abaixo.`; };
    show();
    const timer = setInterval(show, 1000);
    let completed = false;
    try {
      const session = await api("POST", "/api/analysis-sessions", config);
      config = withAnalysisSession(config, session);
      const result = await analyzeCompareRow(getRows()[index], getJobsDir(), getExperimentId(), renderTable, config);
      completed = true;
      progress.textContent = result.failures
        ? `Análise concluída com ${result.failures} erro(s). Abra os detalhes abaixo.`
        : "Análise 1/1 concluída. Abra os detalhes abaixo para ver checks e erros.";
    } catch (err) {
      progress.textContent = "Não foi possível iniciar a análise congelada: " + err.message;
    }
    finally {
      clearInterval(timer);
      analyzing = false;
      lock(false);
      if (!completed && !progress.textContent.startsWith("Não foi possível")) progress.textContent = "A análise não foi concluída.";
    }
  };
  $("#compare-analyze-all-btn").addEventListener("click", async () => {
    if (analyzing) return;
    let config;
    try { config = capture(); } catch (err) { alert(err.message); return; }
    analyzing = true;
    lock(true);
    const startedAt = Date.now(), progress = $("#compare-analysis-progress");
    const eligible = getRows().map((row, index) => row.ok ? index : -1).filter((index) => index >= 0);
    let position = 1;
    const show = () => { progress.textContent = `Analisando ${position}/${eligible.length} · ${Math.round((Date.now() - startedAt) / 1000)}s. Juiz e conjuntos de critérios estão congelados; detalhes aparecem abaixo.`; };
    show();
    const timer = setInterval(show, 1000);
    let completed = false;
    try {
      const session = await api("POST", "/api/analysis-sessions", config);
      config = withAnalysisSession(config, session);
      let failures = 0;
      for (const [batchIndex, rowIndex] of eligible.entries()) {
        position = batchIndex + 1;
        show();
        failures += (await analyzeCompareRow(getRows()[rowIndex], getJobsDir(), getExperimentId(), renderTable, config)).failures;
        lock(true); // renderTable replaces row buttons; keep the batch visibly locked.
      }
      completed = true;
      progress.textContent = failures
        ? `Lote concluído com ${failures} erro(s): ${eligible.length}/${eligible.length} resultados processados com os mesmos inputs.`
        : `Lote concluído: ${eligible.length}/${eligible.length} resultados analisados com os mesmos inputs. Abra os detalhes abaixo.`;
    } catch (err) {
      progress.textContent = "Não foi possível iniciar a análise congelada: " + err.message;
    } finally {
      clearInterval(timer);
      analyzing = false;
      lock(false);
      if (!completed && !progress.textContent.startsWith("Não foi possível")) progress.textContent = "O lote não foi concluído.";
    }
  });
  return { analyzeRow, isRunning: () => analyzing };
}
