// Pure UI state helpers. Keeping these independent from the DOM makes the rules that protect
// paid runs and judge batches directly testable with node:test.

export function cloneCandidate(candidate) {
  return {
    agentId: candidate.agentId,
    modelId: candidate.modelId || "",
    skillsetIds: [...(candidate.skillsetIds || [])],
  };
}

export function baselineIndex(entries) {
  const index = entries.findIndex((entry) => entry.baseline === true);
  return index >= 0 ? index : undefined;
}

export function freezeAnalysisConfig({ judgeId, rubricIds, validationMode }) {
  if (!judgeId) throw new Error("Escolha um juiz antes de analisar.");
  return Object.freeze({
    judgeId,
    rubricIds: Object.freeze((rubricIds?.length ? rubricIds : ["__default__"]).slice()),
    validationMode: validationMode === true,
  });
}

export function createPollingGuard() {
  let generation = 0;
  return {
    next() { generation += 1; return generation; },
    isCurrent(token) { return token === generation; },
    invalidate() { generation += 1; },
  };
}

export function experimentDownloadUrl(jobsDir, experimentId, format) {
  const safeFormat = format === "json" ? "json" : "csv";
  return `/api/experiments/${encodeURIComponent(experimentId)}/report?jobsDir=${encodeURIComponent(jobsDir || "jobs")}&format=${safeFormat}`;
}

export function resultState(row, dryRun = false) {
  if (dryRun && row.ok) return "Configuração validada; sem execução";
  if (row.ok) return "Concluído";
  if (row.errorKind === "infrastructure" || /(?:podman|container|socket|compose|docker_host|spawn)/i.test(row.error || "")) return "Falha de infraestrutura";
  if (row.errorKind === "agent" || Number(row.nErrors) > 0) return "Falha do agente";
  if (row.error) return "Falhou";
  return "Pendente";
}

export function candidateDifferences(candidate, baseline) {
  if (!baseline || candidate === baseline) return [];
  const differences = [];
  if (candidate.agent !== baseline.agent) differences.push("agente");
  if (candidate.model !== baseline.model) differences.push("modelo");
  const skillSignature = (value) => (value.skills || []).map((skill) => `${skill.id}:${skill.mode}:${skill.path || ""}:${skill.instructions || ""}`).sort().join("|");
  if (skillSignature(candidate) !== skillSignature(baseline)) differences.push("skills/instruções");
  return differences;
}

export function withBooleanField(data, name, checked) {
  return { ...data, [name]: checked === true };
}

export function judgeNeedsValidation(models, curatedModels, modelId) {
  const selected = models.find((model) => model.id === modelId);
  if (!selected) return false;
  return !new Set(curatedModels.map((model) => model.value)).has(selected.value);
}
