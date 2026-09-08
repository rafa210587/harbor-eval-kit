const TERMINAL = new Set(["succeeded", "failed"]);

export function createOperationState(id, targetPath = "") {
  return { id, status: "starting", targetPath, offset: 0, logText: "", truncated: false, terminal: false };
}

export function applyOperationSnapshot(state, snapshot) {
  if (!snapshot || snapshot.id !== state.id) return state;
  const content = typeof snapshot.log?.content === "string" ? snapshot.log.content : "";
  const combined = state.logText + content;
  const clipped = combined.length > 200_000;
  return {
    ...state,
    status: snapshot.status || state.status,
    targetPath: snapshot.targetPath || state.targetPath,
    jobsDir: snapshot.jobsDir || state.jobsDir,
    harborJobName: snapshot.harborJobName || state.harborJobName,
    hasHarborJob: typeof snapshot.hasHarborJob === "boolean" ? snapshot.hasHarborJob : state.hasHarborJob,
    artifactPath: snapshot.artifactPath || state.artifactPath,
    operationStatePath: snapshot.operationStatePath || state.operationStatePath,
    operationLogPath: snapshot.operationLogPath || state.operationLogPath,
    offset: Number.isSafeInteger(snapshot.log?.nextOffset) ? snapshot.log.nextOffset : state.offset,
    logText: clipped ? combined.slice(-200_000) : combined,
    truncated: state.truncated || snapshot.log?.truncated === true || clipped,
    error: snapshot.error,
    result: snapshot.result,
    executionUncertain: snapshot.executionUncertain === true,
    terminal: TERMINAL.has(snapshot.status),
  };
}

export function operationStatusText(state) {
  if (state.executionUncertain) return "Execução incerta após reinício; consulte o log e o job antes de agir.";
  if (state.status === "succeeded") return "Operação concluída.";
  if (state.status === "failed") return `Operação falhou${state.error ? `: ${state.error}` : "."}`;
  if (state.status === "running") return "Harbor em execução; acompanhando o log.";
  return "Preparando a operação no Harbor.";
}
