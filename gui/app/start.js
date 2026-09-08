import { $, $$, activateTab } from "./core.js";
import { state, onRefresh } from "./state.js";

function renderChecklist() {
  const checks = [
    [state.secretNames.length > 0, "Credencial disponível", "secrets"],
    [state.models.length > 0, "Modelo cadastrado", "models"],
    [state.agents.length > 0, "Perfil de agente cadastrado", "agents"],
  ];
  const list = $("#start-checklist");
  if (!list) return;
  list.innerHTML = "";
  for (const [done, label, tab] of checks) {
    const li = document.createElement("li");
    li.className = done ? "done" : "todo";
    li.innerHTML = `<span aria-hidden="true">${done ? "✓" : "○"}</span> ${label}`;
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
  const ready = checks.every(([done]) => done);
  $("#start-next").textContent = ready ? "Criar novo experimento" : "Continuar configuração";
  $("#start-next").onclick = () => activateTab(ready ? "compare" : checks.find(([done]) => !done)[2]);
}

$$('[data-go-tab]').forEach((button) => button.addEventListener("click", () => {
  if (button.dataset.mode && $("#compare-mode")) {
    $("#compare-mode").value = button.dataset.mode;
    $("#compare-mode").dispatchEvent(new Event("change"));
  }
  activateTab(button.dataset.goTab);
}));
onRefresh(renderChecklist);
