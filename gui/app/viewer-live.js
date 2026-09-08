import { $, $$, activateTab, api } from "./core.js";
import { applyOperationSnapshot, createOperationState } from "./operation-domain.js";
import { safeLocalViewerUrl, viewerStatusText } from "./viewer-domain.js";

const active = new Map();
let listRequest = 0;

function lockLaunchButtons(locked) {
  $("#view-form button[type=submit]").disabled = locked;
  $("#compare-view-btn").disabled = locked;
  $("#f-jobs-dir-8").disabled = locked;
}

function createLaunchCard(jobsDir) {
  const card = document.createElement("section");
  card.className = "panel viewer-launch-card";
  const title = document.createElement("h3");
  title.textContent = "Inicialização do visualizador";
  const status = document.createElement("p");
  status.className = "hint status-line";
  status.setAttribute("role", "status");
  const path = document.createElement("p");
  path.className = "hint persistent-hint";
  path.textContent = `Pasta de jobs: ${jobsDir}`;
  const link = document.createElement("a");
  link.className = "button secondary";
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "Abrir visualizador";
  link.hidden = true;
  const log = document.createElement("pre");
  log.className = "output viewer-start-log";
  log.setAttribute("aria-live", "off");
  log.hidden = true;
  card.append(title, status, path, link, log);
  $("#view-output").prepend(card);
  return { card, status, link, log };
}

function renderLaunch(view, viewer, operation, startedAt) {
  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  view.status.textContent = operation.executionUncertain
    ? "Execução incerta após reinício; consulte o log e a lista de visualizadores."
    : viewerStatusText(viewer, elapsed);
  view.status.style.color = viewer?.status === "failed" || operation.executionUncertain ? "var(--err)" : viewer?.status === "running" ? "var(--ok)" : "";
  if (operation.logText) {
    view.log.hidden = false;
    view.log.textContent = `${operation.truncated ? "[… início omitido …]\n" : ""}${operation.logText}`;
    view.log.scrollTop = view.log.scrollHeight;
  }
  const safeUrl = safeLocalViewerUrl(viewer?.url);
  if (viewer?.url && !safeUrl) {
    view.status.textContent = "URL recusada: o visualizador só pode abrir um endereço HTTP local.";
    view.status.style.color = "var(--err)";
  }
  if (safeUrl) {
    view.link.href = safeUrl;
    view.link.hidden = false;
  }
  return safeUrl;
}

async function monitorViewer(id, jobsDir, initial) {
  if (active.has(id)) return;
  const view = createLaunchCard(jobsDir);
  const startedAt = Date.now();
  let viewer = initial;
  let operation = createOperationState(id, jobsDir);
  let opened = false;
  let stopped = false;
  let timer;
  const tick = setInterval(() => renderLaunch(view, viewer, operation, startedAt), 1000);
  const finish = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(tick);
    if (timer) clearTimeout(timer);
    active.delete(id);
    lockLaunchButtons(active.size > 0);
    void refreshViewList();
  };
  active.set(id, finish);
  lockLaunchButtons(true);

  const poll = async () => {
    if (stopped || !view.card.isConnected) { finish(); return; }
    const [viewersResult, operationResult] = await Promise.allSettled([
      api("GET", "/api/view"),
      api("GET", `/api/operations/${encodeURIComponent(id)}?offset=${operation.offset}`),
    ]);
    if (operationResult.status === "fulfilled") operation = applyOperationSnapshot(operation, operationResult.value);
    if (viewersResult.status === "fulfilled") {
      const current = viewersResult.value.find((item) => item.id === id);
      if (current) viewer = current;
      else if (!operation.executionUncertain && ["failed", "succeeded"].includes(operation.status)) viewer = { ...viewer, status: operation.status, error: operation.error || viewer?.error };
    } else {
      view.status.textContent = "Não foi possível atualizar o visualizador: " + viewersResult.reason.message;
      view.status.style.color = "var(--err)";
    }
    const safeUrl = renderLaunch(view, viewer, operation, startedAt);
    if (viewer?.url && !safeUrl) { finish(); return; }
    if (safeUrl && !opened) {
      opened = true;
      window.open(safeUrl, "_blank", "noopener");
      finish();
      return;
    }
    if (["failed", "succeeded"].includes(viewer?.status) || ["failed", "succeeded"].includes(operation.status) || operation.executionUncertain) { finish(); return; }
    timer = setTimeout(poll, 1000);
  };
  renderLaunch(view, viewer, operation, startedAt);
  void poll();
}

export async function launchViewer(jobsDir) {
  const normalized = String(jobsDir || "").trim();
  if (!normalized) {
    $("#view-output").textContent = "Informe a pasta de jobs usada na execução.";
    return;
  }
  activateTab("trajectories");
  $("#f-jobs-dir-8").value = normalized;
  lockLaunchButtons(true);
  const pending = createLaunchCard(normalized);
  const startedAt = Date.now();
  const tick = setInterval(() => {
    pending.status.textContent = `Solicitando o visualizador ao Harbor há ${Math.round((Date.now() - startedAt) / 1000)}s…`;
  }, 1000);
  pending.status.textContent = "Solicitando o visualizador ao Harbor…";
  try {
    const viewer = await api("POST", "/api/view", { jobsDir: normalized });
    pending.card.remove();
    await monitorViewer(viewer.id, normalized, viewer);
  } catch (error) {
    pending.status.textContent = "Não foi possível iniciar o visualizador: " + error.message;
    pending.status.style.color = "var(--err)";
    lockLaunchButtons(false);
  } finally {
    clearInterval(tick);
  }
}

export async function refreshViewList() {
  const request = ++listRequest;
  let list;
  try {
    list = await api("GET", "/api/view");
  } catch (error) {
    if (request === listRequest) $("#view-list").textContent = "Erro ao listar visualizadores: " + error.message;
    return;
  }
  if (request !== listRequest) return;
  const host = $("#view-list");
  host.replaceChildren();
  if (!list.length) {
    host.innerHTML = '<p class="muted">Nenhum visualizador ativo.</p>';
    return;
  }
  for (const viewer of list) {
    const row = document.createElement("div");
    row.className = "row";
    const main = document.createElement("div");
    main.className = "row-main";
    const title = document.createElement("div");
    title.className = "row-title";
    title.textContent = viewer.jobsDir;
    const status = document.createElement("div");
    status.className = "row-sub";
    status.textContent = viewerStatusText(viewer, 0);
    const safeUrl = safeLocalViewerUrl(viewer.url);
    if (safeUrl) {
      const link = document.createElement("a");
      link.href = safeUrl;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Abrir";
      status.append(" · ", link);
    } else if (viewer.url) {
      status.append(" URL recusada: somente endereços HTTP locais são aceitos.");
    }
    const stop = document.createElement("button");
    stop.className = "danger stop-view";
    stop.textContent = "Parar";
    stop.onclick = async () => {
      stop.disabled = true;
      status.textContent = "Parando o visualizador…";
      try {
        await api("POST", `/api/view/${encodeURIComponent(viewer.id)}/stop`);
        await refreshViewList();
      } catch (error) {
        status.textContent = "Não foi possível parar: " + error.message;
        stop.disabled = false;
      }
    };
    main.append(title, status);
    row.append(main, stop);
    host.appendChild(row);
    if (viewer.status === "starting" && !active.has(viewer.id)) void monitorViewer(viewer.id, viewer.jobsDir, viewer);
  }
}
