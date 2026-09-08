import { $, api } from "./core.js";
import { renderStandaloneAnalysis } from "./analysis-render.js";
import { applyOperationSnapshot, createOperationState, operationStatusText } from "./operation-domain.js";

const STORAGE_KEY = "hek-active-operations";
const active = new Set();

function readDescriptors() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.filter((item) => item?.id && item?.targetPath) : [];
  } catch { return []; }
}

function writeDescriptors(items) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* optional recovery aid */ }
}

function remember(descriptor) {
  const items = readDescriptors().filter((item) => item.id !== descriptor.id);
  items.push(descriptor);
  writeDescriptors(items.slice(-8));
}

function forget(id) { writeDescriptors(readDescriptors().filter((item) => item.id !== id)); }

function operationCard(descriptor) {
  const card = document.createElement("section");
  card.className = "panel operation-card";
  card.id = `operation-${descriptor.id}`;
  const heading = document.createElement("h3");
  heading.textContent = descriptor.label || "Operação do Harbor";
  const status = document.createElement("p");
  status.className = "hint status-line";
  status.setAttribute("role", "status");
  const path = document.createElement("p");
  path.className = "row-sub persistent-hint";
  path.textContent = `Entrada: ${descriptor.targetPath}`;
  const artifact = document.createElement("p");
  artifact.className = "row-sub persistent-hint";
  artifact.hidden = true;
  const operationLogPath = document.createElement("p");
  operationLogPath.className = "row-sub persistent-hint";
  operationLogPath.hidden = true;
  const log = document.createElement("pre");
  log.className = "output operation-log";
  const logDetails = document.createElement("details");
  logDetails.hidden = true;
  const logSummary = document.createElement("summary");
  logSummary.textContent = "Ver andamento e log";
  logDetails.append(logSummary, log);
  const openLogs = document.createElement("button");
  openLogs.type = "button";
  openLogs.className = "secondary";
  openLogs.textContent = "Abrir este job em Logs";
  openLogs.hidden = true;
  const recovered = document.createElement("div");
  const recoveredDetails = document.createElement("details");
  recoveredDetails.hidden = true;
  const recoveredSummary = document.createElement("summary");
  recoveredSummary.textContent = "Ver resultado recuperado";
  recoveredDetails.append(recoveredSummary, recovered);
  card.append(heading, status, path, operationLogPath, artifact, openLogs, logDetails, recoveredDetails);
  return { card, status, path, operationLogPath, artifact, log, logDetails, openLogs, recovered, recoveredDetails };
}

export function startOperationMonitor(descriptor, { resumed = false } = {}) {
  if (active.has(descriptor.id)) return null;
  active.add(descriptor.id);
  remember(descriptor);
  const host = $("#operation-activity");
  host.hidden = false;
  const view = operationCard(descriptor);
  host.prepend(view.card);
  let state = createOperationState(descriptor.id, descriptor.targetPath);
  let stopped = false;
  let requestPending = !resumed;
  let responseReceived = false;
  let requestError = null;
  let timer = null;
  let recoveredRendered = false;

  const stop = ({ preserve = false } = {}) => {
    stopped = true;
    if (timer) clearTimeout(timer);
    active.delete(descriptor.id);
    if (!preserve) forget(descriptor.id);
  };
  const schedule = () => { if (!stopped) timer = setTimeout(poll, 1000); };
  const render = () => {
    view.status.textContent = operationStatusText(state);
    view.status.style.color = state.status === "failed" ? "var(--err)" : state.status === "succeeded" ? "var(--ok)" : "";
    view.path.textContent = `Entrada: ${state.targetPath || descriptor.targetPath}`;
    if (state.operationLogPath) {
      view.operationLogPath.hidden = false;
      view.operationLogPath.textContent = `Log persistido da operação: ${state.operationLogPath}`;
    }
    if (state.artifactPath) {
      view.artifact.hidden = false;
      view.artifact.textContent = `Artefato: ${state.artifactPath}`;
    }
    if (state.logText) {
      view.logDetails.hidden = false;
      view.log.textContent = `${state.truncated ? "[… início omitido …]\n" : ""}${state.logText}`;
      view.log.scrollTop = view.log.scrollHeight;
    }
    if (state.hasHarborJob && state.jobsDir && state.harborJobName) {
      view.openLogs.hidden = false;
      view.openLogs.onclick = () => document.dispatchEvent(new CustomEvent("hek:open-operation-log", {
        detail: { jobsDir: state.jobsDir, job: state.harborJobName },
      }));
    }
    if (!requestPending && !responseReceived && state.result && !recoveredRendered) {
      recoveredRendered = true;
      view.recoveredDetails.hidden = false;
      renderStandaloneAnalysis(view.recovered, state.result);
    }
  };
  async function poll() {
    if (stopped || !view.card.isConnected) { stop({ preserve: true }); return; }
    try {
      const snapshot = await api("GET", `/api/operations/${encodeURIComponent(descriptor.id)}?offset=${state.offset}`);
      if (stopped) return;
      state = applyOperationSnapshot(state, snapshot);
      render();
      if (state.executionUncertain) { stop({ preserve: true }); return; }
      // The persisted operation can finish just before the original POST response reaches the
      // browser. Keep its descriptor until that request settles so a reload in this small window
      // can still recover the result from disk.
      if (state.terminal) {
        if (!requestPending) stop({ preserve: true });
        return;
      }
    } catch (error) {
      if (error.status === 404) {
        if (!requestPending) {
          view.status.textContent = requestError?.message || "A requisição foi recusada antes de iniciar o Harbor.";
          view.status.style.color = "var(--err)";
          stop();
          return;
        }
      } else {
        view.status.textContent = `Falha ao acompanhar a operação: ${error.message}. Tentando novamente…`;
        view.status.style.color = "var(--err)";
      }
    }
    schedule();
  }
  view.status.textContent = resumed ? "Retomando acompanhamento da operação…" : "Aguardando o Harbor iniciar…";
  void poll();
  return {
    id: descriptor.id,
    requestSettled({ received = false, error = null } = {}) {
      requestPending = false;
      responseReceived = received;
      requestError = error;
      if (error) view.status.textContent = `${error.message}. Conferindo o estado persistido da operação…`;
      render();
      if (state.terminal) stop({ preserve: true });
      else if (!timer) schedule();
    },
  };
}

export function resumeOperationMonitors() {
  for (const descriptor of readDescriptors()) startOperationMonitor(descriptor, { resumed: true });
}
