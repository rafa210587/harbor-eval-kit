// Reopen persisted comparisons, including runs started by the CLI. No registry changes.
import { $, api, escapeHtml } from "./core.js";

const KEY = "hek-last-experiment";
export function rememberExperiment(jobsDir, id) {
  try { localStorage.setItem(KEY, JSON.stringify({ jobsDir, id })); } catch { /* optional convenience */ }
}

export function setupExperimentHistory(onOpen) {
  const picker = $("#experiment-history-picker");
  const jobsInput = $("#experiment-history-dir");
  const status = $("#experiment-history-status");
  async function refreshHistory() {
    try {
      const rows = await api("GET", `/api/experiments?jobsDir=${encodeURIComponent(jobsInput.value || "jobs")}`);
      picker.innerHTML = '<option value="">— escolher experimento —</option>' + rows.map(r => {
        const title = r.title || r.id;
        const task = r.nTasks > 1 ? `${r.nTasks} tasks` : (r.taskPath || "task não informada");
        return `<option value="${escapeHtml(r.id)}">${escapeHtml(title)} · ${escapeHtml(r.status)} · ${escapeHtml(task)} · ${escapeHtml(r.createdAt)}</option>`;
      }).join("");
      status.textContent = rows.length ? `${rows.length} experimento(s) salvo(s).` : "Nenhum experimento salvo nesta pasta. Rode uma comparação primeiro.";
    } catch (err) { status.textContent = err.message; }
  }
  async function openExperiment(id) {
    if (!id) return;
    const button = $("#experiment-history-open");
    button.disabled = true;
    try {
      const record = await api("GET", `/api/experiments/${encodeURIComponent(id)}?jobsDir=${encodeURIComponent(jobsInput.value || "jobs")}`);
      onOpen(record);
      rememberExperiment(jobsInput.value, id);
      status.textContent = record.executionUncertain
        ? "Servidor reiniciado: execução sem confirmação de atividade. Os resultados vêm do disco; confira os logs antes de agir."
        : `Estado: ${record.status}. Este registro é imutável. Para repetir, crie um novo experimento e confira a prévia; o catálogo pode ter mudado.`;
    } catch (err) { status.textContent = err.message; }
    finally { button.disabled = false; }
  }
  $("#experiment-history-refresh").addEventListener("click", refreshHistory);
  $("#experiment-history-open").addEventListener("click", () => openExperiment(picker.value));
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved?.id && saved?.jobsDir) {
      jobsInput.value = saved.jobsDir;
      refreshHistory().then(() => { picker.value = saved.id; openExperiment(saved.id); });
    } else refreshHistory();
  } catch { refreshHistory(); }
}
