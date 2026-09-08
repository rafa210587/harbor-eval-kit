import { standaloneAnalysisView } from "./analysis-view.js";

function appendText(parent, tag, text, className) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

// DOM-only renderer with no API calls or application wiring. This can be exercised against a
// saved response in a disposable page without sending another paid judge request.
export function renderStandaloneAnalysis(out, response) {
  const view = standaloneAnalysisView(response);
  out.replaceChildren();
  if (!view.hasAnalysis) {
    appendText(out, "p", response.stdout || response.stderr || "A análise terminou sem um relatório legível.", "hint status-line");
  } else {
    const heading = document.createElement("div");
    heading.className = "analysis-heading";
    appendText(heading, "strong", "Análise concluída");
    if (view.validationMode) appendText(heading, "span", "Modo validação — não vale como avaliação", "badge validation-badge");
    out.appendChild(heading);
    appendText(out, "p", `Modelo juiz: ${view.judgeModel}`, "hint status-line");
    const c = view.counts;
    const countsKnown = [c.pass, c.fail, c.notApplicable, c.unknown].every((value) => value !== undefined);
    appendText(out, "p", countsKnown
      ? `Checks: ${c.pass} PASS · ${c.fail} FAIL · ${c.notApplicable} N/A · ${c.unknown} desconhecido(s).`
      : "Resumo de checks não reportado.", "analysis-summary");
    if (view.costUsd !== undefined) {
      appendText(out, "p", `Custo reportado pelo juiz: $${view.costUsd.toFixed(6)}`, "hint status-line");
    } else if (view.partialCostUsd !== undefined) {
      appendText(out, "p", `Custo parcial reportado: $${view.partialCostUsd.toFixed(6)} (${view.costReportedTrials ?? "?"}/${view.nTrials} trials). O total não foi reportado.`, "hint status-line");
    } else appendText(out, "p", "Custo do juiz não reportado.", "hint status-line");

    for (const [index, trial] of view.trials.entries()) {
      const section = document.createElement("section");
      section.className = "analysis-trial";
      appendText(section, "h3", `${index + 1}. ${trial.label}`, "step");
      if (trial.summary) appendText(section, "p", trial.summary, "analysis-summary");
      if (!trial.checks.length) appendText(section, "p", "Nenhum check reportado neste trial.", "muted");
      for (const check of trial.checks) {
        const row = document.createElement("div");
        row.className = "analysis-check";
        appendText(row, "span", check.label, `badge outcome-${check.kind}`);
        const copy = document.createElement("div");
        appendText(copy, "strong", check.name);
        if (check.explanation) appendText(copy, "p", check.explanation, "row-sub");
        row.appendChild(copy);
        section.appendChild(row);
      }
      out.appendChild(section);
    }
  }
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "Detalhes técnicos (JSON)";
  const pre = document.createElement("pre");
  pre.className = "output";
  pre.textContent = JSON.stringify(response, null, 2);
  details.append(summary, pre);
  out.appendChild(details);
}
