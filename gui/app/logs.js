// Logs tab: incremental tail of the log files harbor writes into the jobs dir.
import { $, api, escapeHtml, tabRefreshers, onTabSwitch } from "./core.js";
import { createLogReadGuard } from "./log-domain.js";

// ================= LOGS =================
// Reads the log files harbor writes into the jobs dir. Polling (not SSE/websocket) on purpose:
// the run is a plain child process writing to disk, so tailing the file is the same mechanism
// whether the run was started here, by the CLI, or by a gui-server that has since restarted.

const logsState = { offset: 0, timer: null, jobsDir: null, job: null, file: null, tailBusy: false, tailQueued: false };
const tailGuard = createLogReadGuard();
let jobsRequest = 0;
let filesRequest = 0;

const selectedContext = () => ({
  jobsDir: $("#logs-jobs-dir").value || "jobs",
  job: $("#logs-job-picker").value,
  file: $("#logs-file-picker").value,
});

async function refreshLogJobs() {
  const jobsDir = $("#logs-jobs-dir").value || "jobs";
  const request = ++jobsRequest;
  const changedDirectory = jobsDir !== logsState.jobsDir;
  if (changedDirectory) {
    Object.assign(logsState, { jobsDir, job: null, file: null, offset: 0 });
    tailGuard.select({ jobsDir, job: "", file: "" });
    $("#logs-job-picker").innerHTML = '<option value="">— carregando jobs —</option>';
    $("#logs-file-picker").innerHTML = "";
    $("#logs-content").textContent = "";
  }
  let jobs = [];
  try {
    jobs = await api("GET", `/api/logs/jobs?jobsDir=${encodeURIComponent(jobsDir)}`);
    if (request !== jobsRequest || jobsDir !== ($("#logs-jobs-dir").value || "jobs")) return;
  } catch (err) {
    if (request === jobsRequest && jobsDir === ($("#logs-jobs-dir").value || "jobs")) $("#logs-status").textContent = "Erro ao listar jobs: " + err.message;
    return;
  }
  const picker = $("#logs-job-picker");
  const previous = changedDirectory ? "" : picker.value;
  picker.innerHTML = jobs.length
    ? jobs.map((j) => `<option value="${escapeHtml(j.name)}">${j.running ? "▶ " : ""}${escapeHtml(j.name)}</option>`).join("")
    : '<option value="">— nenhuma run neste jobs dir ainda —</option>';
  if (previous && jobs.some((j) => j.name === previous)) picker.value = previous;
  if (jobsDir !== logsState.jobsDir || picker.value !== logsState.job) await refreshLogFiles();
}

async function refreshLogFiles() {
  const jobsDir = $("#logs-jobs-dir").value || "jobs";
  const job = $("#logs-job-picker").value;
  const request = ++filesRequest;
  const picker = $("#logs-file-picker");
  const previous = jobsDir === logsState.jobsDir && job === logsState.job ? picker.value : "";
  logsState.jobsDir = jobsDir;
  logsState.job = job;
  logsState.file = null;
  logsState.offset = 0;
  tailGuard.select({ jobsDir, job, file: "" });
  $("#logs-content").textContent = "";
  picker.innerHTML = job ? '<option value="">— carregando arquivos —</option>' : "";
  if (!job) return;
  let files = [];
  try {
    files = await api("GET", `/api/logs/files?jobsDir=${encodeURIComponent(jobsDir)}&job=${encodeURIComponent(job)}`);
  } catch { files = []; }
  if (request !== filesRequest || jobsDir !== ($("#logs-jobs-dir").value || "jobs") || job !== $("#logs-job-picker").value) return;
  picker.innerHTML = files.length
    ? files.map((f) => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join("")
    : '<option value="">— sem arquivos de log ainda —</option>';
  if (previous && files.includes(previous)) picker.value = previous;
  else {
    // Files are listed newest-first, which puts tiny artifacts like verifier/reward.txt (one
    // byte) on top. What you actually want open is the execution log, so prefer that.
    const preferred = files.find((f) => f.endsWith("trial.log")) || files.find((f) => f === "job.log");
    if (preferred) picker.value = preferred;
  }
  logsState.file = picker.value;
  tailGuard.select(selectedContext());
  await pollLogTail(true);
}

async function pollLogTail(reset) {
  const { jobsDir, job, file } = selectedContext();
  if (!job || !file) return;
  if (reset || jobsDir !== logsState.jobsDir || job !== logsState.job || file !== logsState.file) {
    logsState.offset = 0;
    Object.assign(logsState, { jobsDir, job, file });
    $("#logs-content").textContent = "";
    tailGuard.select({ jobsDir, job, file });
  }
  if (logsState.tailBusy) { logsState.tailQueued = true; return; }
  logsState.tailBusy = true;
  const request = tailGuard.snapshot({ jobsDir, job, file }, logsState.offset);
  try {
    const tail = await api(
      "GET",
      `/api/logs/tail?jobsDir=${encodeURIComponent(jobsDir)}&job=${encodeURIComponent(job)}&file=${encodeURIComponent(file)}&offset=${request.offset}`
    );
    if (!tailGuard.isCurrent(request, selectedContext())) return;
    if (tail.content) {
      const el = $("#logs-content");
      el.textContent += tail.content;
      if ($("#logs-follow").checked) el.scrollTop = el.scrollHeight;
    }
    logsState.offset = tail.nextOffset;
    $("#logs-status").textContent =
      `${(tail.size / 1024).toFixed(1)} KB` + (tail.truncated ? " (mostrando só os últimos 200 KB)" : "") + " — " + new Date().toLocaleTimeString();
  } catch (err) {
    if (tailGuard.isCurrent(request, selectedContext())) $("#logs-status").textContent = "Erro ao ler log: " + err.message;
  } finally {
    logsState.tailBusy = false;
    if (logsState.tailQueued) {
      logsState.tailQueued = false;
      void pollLogTail(false);
    }
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
  if (!on) logsState.tailQueued = false;
  if (on) logsState.timer = setInterval(() => { if ($("#logs-follow").checked) pollLogTail(false); }, 2000);
}


tabRefreshers.logs = refreshLogJobs;
// Polling runs only while the Logs tab is the visible one.
onTabSwitch((tab) => setLogsPolling(tab === "logs"));
