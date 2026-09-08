// Pure projection of Harbor's normalized analysis response for the GUI. Keeping this free of
// DOM access makes the distinctions between PASS, FAIL, N/A and unknown testable without a
// browser, and keeps JSON-looking summary text as ordinary text.
const isObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);
const finiteNumber = (value) => typeof value === "number" && Number.isFinite(value) ? value : undefined;

export function analysisOutcome(value) {
  if (value === "pass") return { label: "PASS", kind: "pass" };
  if (value === "fail") return { label: "FAIL", kind: "fail" };
  if (value === "not_applicable") return { label: "N/A", kind: "na" };
  return { label: "Desconhecido", kind: "unknown" };
}

export function standaloneAnalysisView(response) {
  const analysis = isObject(response?.analysis) ? response.analysis : null;
  const rawTrials = Array.isArray(analysis?.results)
    ? analysis.results
    : (analysis && (isObject(analysis.checks) || typeof analysis.summary === "string") ? [analysis] : []);
  const trials = rawTrials.filter(isObject).map((trial, index) => ({
    label: String(trial.trial_name || trial.trial_path || `Trial ${index + 1}`),
    summary: typeof trial.summary === "string" ? trial.summary : "",
    checks: Object.entries(isObject(trial.checks) ? trial.checks : {}).map(([name, rawCheck]) => {
      const check = isObject(rawCheck) ? rawCheck : {};
      return {
        name,
        ...analysisOutcome(check.outcome),
        explanation: typeof check.explanation === "string" ? check.explanation : "",
      };
    }),
  }));
  const aggregate = isObject(analysis?.aggregate) ? analysis.aggregate : {};
  const costUsd = finiteNumber(aggregate.costUsd);
  const partialCostUsd = costUsd === undefined ? finiteNumber(aggregate.reportedCostUsd) : undefined;
  return {
    hasAnalysis: !!analysis,
    validationMode: response?.validationMode === true,
    judgeModel: typeof response?.judgeModel === "string" ? response.judgeModel : "Não reportado",
    trials,
    counts: {
      pass: finiteNumber(aggregate.pass),
      fail: finiteNumber(aggregate.fail),
      notApplicable: finiteNumber(aggregate.notApplicable),
      unknown: finiteNumber(aggregate.unknown),
      incompleteTrials: finiteNumber(aggregate.incompleteTrials),
    },
    costUsd,
    partialCostUsd,
    costReportedTrials: finiteNumber(aggregate.costReportedTrials),
    nTrials: finiteNumber(aggregate.nTrials) ?? trials.length,
  };
}
