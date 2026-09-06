// Datasets: download a published task suite; its tasks then appear alongside your own.
import { $, api, escapeHtml } from "./core.js";
import { refreshTaskList } from "./tasks.js";

// ================= DATASETS =================
$("#dataset-list-btn").addEventListener("click", async () => {
  const out = $("#dataset-output");
  out.textContent = "Loading…";
  try {
    const res = await api("GET", "/api/datasets");
    out.textContent = (res.stdout || "") + (res.stderr || "");
  } catch (err) { out.textContent = "Error: " + err.message; }
});
$("#dataset-download-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  const out = $("#dataset-output");
  const discovered = $("#dataset-discovered");
  out.textContent = "Downloading…";
  discovered.innerHTML = "";
  try {
    const res = await api("POST", "/api/datasets/download", data);
    out.textContent = (res.stdout || "") + (res.stderr || "");
    if (res.ok) {
      await refreshTaskList();
      const tasks = await api("GET", "/api/tasks");
      const found = tasks.filter((t) => t.source === "datasets" && t.path.includes(String(data.name).split("@")[0]));
      discovered.innerHTML = found.length
        ? `<p class="hint">Tasks encontradas (já aparecem na aba Tasks e no Compare):</p>` +
          found.map((t) => `<div class="row"><span>${escapeHtml(t.path)}</span></div>`).join("")
        : '<p class="muted">Nenhuma task nova encontrada em datasets/ — confira a saída acima.</p>';
    }
  } catch (err) { out.textContent = "Error: " + err.message; }
});

