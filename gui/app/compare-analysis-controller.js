import { $, $$ } from "./core.js";
import { freezeAnalysisConfig } from "./compare-domain.js";
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
    try { await analyzeCompareRow(getRows()[index], getJobsDir(), getExperimentId(), renderTable, config); }
    finally {
      clearInterval(timer);
      analyzing = false;
      lock(false);
      progress.textContent = "Análise 1/1 concluída. Abra os detalhes abaixo para ver checks e erros.";
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
    const show = () => { progress.textContent = `Analisando ${position}/${eligible.length} · ${Math.round((Date.now() - startedAt) / 1000)}s. Juiz e rubrics estão congelados; detalhes aparecem abaixo.`; };
    show();
    const timer = setInterval(show, 1000);
    try {
      for (const [batchIndex, rowIndex] of eligible.entries()) {
        position = batchIndex + 1;
        show();
        await analyzeCompareRow(getRows()[rowIndex], getJobsDir(), getExperimentId(), renderTable, config);
        lock(true); // renderTable replaces row buttons; keep the batch visibly locked.
      }
    } finally {
      clearInterval(timer);
      analyzing = false;
      lock(false);
      progress.textContent = `Lote concluído: ${eligible.length}/${eligible.length} resultados analisados com os mesmos inputs. Abra os detalhes abaixo.`;
    }
  });
  return { analyzeRow, isRunning: () => analyzing };
}
