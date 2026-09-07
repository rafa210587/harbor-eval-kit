// Trajectories (harbor view) and the standalone Analyze tab.
import { $, $$, api, escapeHtml, tabRefreshers } from "./core.js";
import { state } from "./state.js";

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
  const data = Object.fromEntries(new FormData(e.target).entries());
  const out = $("#analyze-output");
  out.textContent = "Analyzing… (chamada de LLM, pode demorar)";
  try {
    const res = await api("POST", "/api/analyze", data);
    out.textContent = res.analysis ? JSON.stringify({ validationMode: !!res.validationMode, judgeModel: res.judgeModel, analysis: res.analysis }, null, 2) : (res.stdout || "") + (res.stderr || "");
  } catch (err) { out.textContent = "Error: " + err.message; }
});
