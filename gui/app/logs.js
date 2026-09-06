// Logs tab: incremental tail of the log files harbor writes into the jobs dir.
import { $, $$, api, escapeHtml, tabRefreshers, onTabSwitch } from "./core.js";

// ================= LOGS =================
// Reads the log files harbor writes into the jobs dir. Polling (not SSE/websocket) on purpose:
// the run is a plain child process writing to disk, so tailing the file is the same mechanism
// whether the run was started here, by the CLI, or by a gui-server that has since restarted.

const logsState = { offset: 0, timer: null, job: null, file: null };

async function refreshLogJobs() {
  const jobsDir = $("#logs-jobs-dir").value || "jobs";
  let jobs = [];
  try {
    jobs = await api("GET", `/api/logs/jobs?jobsDir=${encodeURIComponent(jobsDir)}`);
  } catch (err) {
    $("#logs-status").textContent = "Erro ao listar jobs: " + err.message;
    return;
  }
  const picker = $("#logs-job-picker");
  const previous = picker.value;
  picker.innerHTML = jobs.length
    ? jobs.map((j) => `<option value="${escapeHtml(j.name)}">${j.running ? "▶ " : ""}${escapeHtml(j.name)}</option>`).join("")
    : '<option value="">— nenhuma run neste jobs dir ainda —</option>';
  if (previous && jobs.some((j) => j.name === previous)) picker.value = previous;
  if (picker.value !== logsState.job) await refreshLogFiles();
}

async function refreshLogFiles() {
  const jobsDir = $("#logs-jobs-dir").value || "jobs";
  const job = $("#logs-job-picker").value;
  logsState.job = job;
  if (!job) { $("#logs-file-picker").innerHTML = ""; return; }
  let files = [];
  try {
    files = await api("GET", `/api/logs/files?jobsDir=${encodeURIComponent(jobsDir)}&job=${encodeURIComponent(job)}`);
  } catch { files = []; }
  const picker = $("#logs-file-picker");
  const previous = picker.value;
  picker.innerHTML = files.length
    ? files.map((f) => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join("")
    : '<option value="">— sem arquivos de log ainda —</option>';
  if (previous && files.includes(previous)) picker.value = previous;
  else {
    // Files are listed newest-first, which puts tiny artifacts like verifier/reward.txt (one
    // byte) on top. What you actually want open is the execution log, so prefer that.
    const preferred = files.find((f) => f.endsWith("trial.log")) || files.find((f) => f === "job.log");
    if (preferred) picker.value = preferred;
    logsState.offset = 0;
    $("#logs-content").textContent = "";
  }
  await pollLogTail(true);
}

async function pollLogTail(reset) {
  const jobsDir = $("#logs-jobs-dir").value || "jobs";
  const job = $("#logs-job-picker").value;
  const file = $("#logs-file-picker").value;
  if (!job || !file) return;
  if (reset || file !== logsState.file) { logsState.offset = 0; logsState.file = file; $("#logs-content").textContent = ""; }
  try {
    const tail = await api(
      "GET",
      `/api/logs/tail?jobsDir=${encodeURIComponent(jobsDir)}&job=${encodeURIComponent(job)}&file=${encodeURIComponent(file)}&offset=${logsState.offset}`
    );
    if (tail.content) {
      const el = $("#logs-content");
      el.textContent += tail.content;
      if ($("#logs-follow").checked) el.scrollTop = el.scrollHeight;
    }
    logsState.offset = tail.nextOffset;
    $("#logs-status").textContent =
      `${(tail.size / 1024).toFixed(1)} KB` + (tail.truncated ? " (mostrando só os últimos 200 KB)" : "") + " — " + new Date().toLocaleTimeString();
  } catch (err) {
    $("#logs-status").textContent = "Erro ao ler log: " + err.message;
  }
}

$("#logs-refresh-btn").addEventListener("click", () => refreshLogJobs());
$("#logs-jobs-dir").addEventListener("change", () => refreshLogJobs());
$("#logs-job-picker").addEventListener("change", () => refreshLogFiles());
$("#logs-file-picker").addEventListener("change", () => pollLogTail(true));
$("#logs-follow").addEventListener("change", () => { if ($("#logs-follow").checked) pollLogTail(false); });

// One interval for the whole tab, started only while it's the visible tab -- no background
// polling of a tab nobody is looking at.
function setLogsPolling(on) {
  if (logsState.timer) { clearInterval(logsState.timer); logsState.timer = null; }
  if (on) logsState.timer = setInterval(() => { if ($("#logs-follow").checked) pollLogTail(false); }, 2000);
}


tabRefreshers.logs = refreshLogJobs;
// Polling runs only while the Logs tab is the visible one.
onTabSwitch((tab) => setLogsPolling(tab === "logs"));
