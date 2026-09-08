import { $, api } from "./core.js";
import { createPollingGuard } from "./compare-domain.js";

const liveGuard = createPollingGuard();
let activeTrackerStop = null;

export function stopCompareLiveLog({ clear = false } = {}) {
  activeTrackerStop?.();
  if (clear) {
    $("#compare-live").hidden = true;
    $("#compare-live-log").textContent = "";
  }
}

// Polls disk-backed experiment state and one current log. A generation token prevents a slow
// response from an older experiment from overwriting the newly opened one.
export function startCompareLiveLog(jobsDir, experimentId, { reconnect = false, canCancel = false, onRecord, onTerminal } = {}) {
  stopCompareLiveLog();
  const token = liveGuard.next();
  const box = $("#compare-live"), pre = $("#compare-live-log");
  const cancelBtn = $("#compare-cancel-btn"), submitBtn = $("#compare-submit-btn");
  box.hidden = false;
  pre.textContent = "";
  let job = null, file = null, offset = 0, timer = null, stopped = false;
  const cancelReloaded = async () => {
    cancelBtn.disabled = true;
    cancelBtn.textContent = "Cancelando…";
    try {
      const response = await api("POST", "/api/compare/cancel", { runId: experimentId });
      $("#compare-output").textContent = `Cancelamento pedido: ${response.note}`;
    } catch (err) { $("#compare-output").textContent = `Não foi possível cancelar: ${err.message}`; }
  };
  if (reconnect) {
    submitBtn.disabled = true;
    cancelBtn.hidden = !canCancel;
    cancelBtn.addEventListener("click", cancelReloaded);
  }
  const poll = async () => {
    try {
      const record = await api("GET", `/api/experiments/${encodeURIComponent(experimentId)}?jobsDir=${encodeURIComponent(jobsDir)}`);
      if (stopped || !liveGuard.isCurrent(token)) return;
      onRecord?.(record);
      if (reconnect) {
        const uncertain = record.executionUncertain ? " · atividade incerta após reinício do servidor; confira o log" : "";
        $("#compare-output").textContent = `Experimento ${record.plan.id} · ${record.status} · ${record.rows.length}/${record.plan.candidates.length} candidatos${uncertain}`;
        if (record.status !== "running") {
          submitBtn.disabled = false;
          cancelBtn.hidden = true;
          onTerminal?.(record);
          stopped = true;
          setTimeout(() => stop(), 0);
          return;
        }
      }
      const names = new Set(record.plan.candidates.map((candidate) => candidate.jobName));
      const jobs = await api("GET", `/api/logs/jobs?jobsDir=${encodeURIComponent(jobsDir)}`);
      const ownJobs = jobs.filter((candidateJob) => names.has(candidateJob.name));
      const running = ownJobs.find((candidateJob) => candidateJob.running) || ownJobs[0];
      if (!running) return;
      if (job !== running.name) { file = null; offset = 0; pre.textContent = ""; }
      job = running.name;
      if (!file) {
        const files = await api("GET", `/api/logs/files?jobsDir=${encodeURIComponent(jobsDir)}&job=${encodeURIComponent(job)}`);
        file = files.find((name) => name.endsWith("trial.log")) || files.find((name) => name === "job.log") || files[0];
        if (!file) return;
      }
      const tail = await api("GET", `/api/logs/tail?jobsDir=${encodeURIComponent(jobsDir)}&job=${encodeURIComponent(job)}&file=${encodeURIComponent(file)}&offset=${offset}`);
      if (stopped || !liveGuard.isCurrent(token)) return;
      if (tail.content) { pre.textContent += tail.content; pre.scrollTop = pre.scrollHeight; }
      offset = tail.nextOffset;
    } catch { /* experiment or log may not exist yet; retry */ }
    finally { if (!stopped && liveGuard.isCurrent(token)) timer = setTimeout(poll, 2000); }
  };
  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    cancelBtn.removeEventListener("click", cancelReloaded);
    if (liveGuard.isCurrent(token)) liveGuard.invalidate();
    if (activeTrackerStop === stop) activeTrackerStop = null;
  };
  activeTrackerStop = stop;
  poll();
  return stop;
}
