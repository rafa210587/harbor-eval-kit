// Datasets: download a published task suite; its tasks then appear alongside your own.
import { $, api, escapeHtml } from "./core.js";
import { refreshTaskList } from "./tasks.js";
import { downloadedTasks } from "./dataset-domain.js";

// ================= DATASETS =================
$("#dataset-list-btn").addEventListener("click", async () => {
  const out = $("#dataset-output");
  out.textContent = "Carregando…";
  try {
    const res = await api("GET", "/api/datasets");
    out.textContent = (res.stdout || "") + (res.stderr || "");
  } catch (err) { out.textContent = "Erro: " + err.message; }
});
$("#dataset-download-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  const out = $("#dataset-output");
  const discovered = $("#dataset-discovered");
  const button = e.target.querySelector('button[type="submit"]');
  if (button.disabled) return;
  button.disabled = true;
  const started = Date.now();
  const timer = setInterval(() => { out.textContent = `Baixando… ${Math.round((Date.now() - started) / 1000)}s. Aguarde o Harbor concluir.`; }, 1000);
  out.textContent = "Baixando…";
  discovered.innerHTML = "";
  try {
    const res = await api("POST", "/api/datasets/download", data);
    clearInterval(timer);
    out.textContent = (res.stdout || "") + (res.stderr || "");
    if (res.ok) {
      await refreshTaskList();
      const tasks = await api("GET", "/api/tasks");
      const found = downloadedTasks(tasks, res.outputDir || data.outputDir);
      discovered.innerHTML = found.length
        ? `<p class="hint">Tasks encontradas (já aparecem em Tasks e em Novo experimento):</p>` +
          found.map((t) => `<div class="row"><span>${escapeHtml(t.path)}</span></div>`).join("")
        : '<p class="muted">Nenhuma task nova encontrada em datasets/ — confira a saída acima.</p>';
    }
  } catch (err) { out.textContent = "Erro: " + err.message; }
  finally { clearInterval(timer); button.disabled = false; }
});
