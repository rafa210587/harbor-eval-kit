// Trajectories (harbor view) and the standalone Analyze tab.
import { $, $$, api, escapeHtml, tabRefreshers } from "./core.js";
import { withBooleanField } from "./compare-domain.js";
import { renderStandaloneAnalysis } from "./analysis-render.js";

// ================= TRAJECTORIES =================
$("#view-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  const out = $("#view-output");
  out.textContent = "Starting harbor view…";
  try {
    const res = await api("POST", "/api/view", data);
    out.innerHTML = res.url
      ? `Running: <a href="${res.url}" target="_blank">${res.url}</a>`
      : "Started, but no URL detected within 8s (pode ainda estar buildando o viewer).";
    refreshViewList();
  } catch (err) { out.textContent = "Error: " + err.message; }
});

export async function refreshViewList() {
  const list = await api("GET", "/api/view");
  $("#view-list").innerHTML = list.length ? list.map((v) =>
    `<div class="row"><span>${escapeHtml(v.jobsDir)} — ${v.url ? `<a href="${v.url}" target="_blank">${v.url}</a>` : "(no url yet)"}</span>` +
    `<button data-id="${v.id}" class="stop-view">Stop</button></div>`
  ).join("") : '<p class="muted">No viewers running.</p>';
  $$(".stop-view").forEach((btn) => btn.onclick = async () => { await api("POST", `/api/view/${btn.dataset.id}/stop`); refreshViewList(); });
}
tabRefreshers.trajectories = refreshViewList;

// ================= ANALYZE =================
$("#analyze-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const rawData = Object.fromEntries(new FormData(e.target).entries());
  // FormData represents a checked checkbox as the string "on". The API deliberately requires
  // a real boolean so validation results cannot be mistaken for a high-tier judgment.
  const data = withBooleanField(rawData, "validationMode", $("#analyze-standalone-validation-mode").checked);
  const out = $("#analyze-output");
  const button = e.target.querySelector('button[type="submit"]');
  if (button.disabled) return;
  button.disabled = true;
  const originalLabel = button.textContent;
  const startedAt = Date.now();
  const tick = setInterval(() => {
    button.textContent = `Analisando… ${Math.round((Date.now() - startedAt) / 1000)}s`;
    out.textContent = `Análise em andamento há ${Math.round((Date.now() - startedAt) / 1000)}s. Esta operação faz uma chamada ao modelo juiz.`;
  }, 1000);
  out.textContent = "Analisando… (chamada de LLM, pode demorar)";
  try {
    const res = await api("POST", "/api/analyze", data);
    renderStandaloneAnalysis(out, res);
  } catch (err) { out.textContent = "Error: " + err.message; }
  finally {
    clearInterval(tick);
    button.disabled = false;
    button.textContent = originalLabel;
  }
});
