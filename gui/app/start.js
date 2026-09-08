import { $, $$, activateTab } from "./core.js";
import { state, onRefresh } from "./state.js";
import { firstUseChecklist } from "./start-domain.js";

function renderChecklist() {
  const taskPath = $("#compare-form input[name=path]")?.value || "";
  const checks = firstUseChecklist({
    agents: state.agents,
    models: state.models,
    secretNames: state.secretNames,
    freeAgents: state.freeAgents,
    taskPath,
    hasTasks: $("#compare-task-picker")?.options.length > 1,
  });
  const list = $("#start-checklist");
  if (!list) return;
  list.innerHTML = "";
  for (const { done, label, tab } of checks) {
    const li = document.createElement("li");
    li.className = done ? "done" : "todo";
    const marker = document.createElement("span");
    marker.setAttribute("aria-hidden", "true");
    marker.textContent = done ? "✓" : "○";
    li.append(marker, ` ${label}`);
    if (!done) {
      const button = document.createElement("button");
      button.className = "link";
      button.type = "button";
      button.textContent = "Configurar";
      button.onclick = () => activateTab(tab);
      li.appendChild(button);
    }
    list.appendChild(li);
  }
  const ready = checks.every(({ done }) => done);
  $("#start-next").textContent = ready ? "Criar novo experimento" : "Continuar configuração";
  $("#start-next").onclick = () => activateTab(ready ? "compare" : checks.find(({ done }) => !done).tab);
}

$$('[data-go-tab]').forEach((button) => button.addEventListener("click", () => {
  if (button.dataset.mode && $("#compare-mode")) {
    $("#compare-mode").value = button.dataset.mode;
    $("#compare-mode").dispatchEvent(new Event("change"));
  }
  activateTab(button.dataset.goTab);
}));
onRefresh(renderChecklist);
document.addEventListener("hek:tasks-refreshed", renderChecklist);
$("#compare-task-picker")?.addEventListener("change", renderChecklist);
$("#compare-form input[name=path]")?.addEventListener("input", renderChecklist);
