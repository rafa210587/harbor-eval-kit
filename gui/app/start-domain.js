export function firstUseChecklist({ agents = [], models = [], secretNames = [], freeAgents = [], taskPath = "", hasTasks = false }) {
  const selectedTask = String(taskPath || "").trim();
  const checks = [{
    done: !!selectedTask,
    label: selectedTask
      ? `Task escolhida: ${selectedTask}`
      : (hasTasks ? "Escolha uma task no Novo experimento" : "Crie ou baixe uma task"),
    tab: hasTasks ? "compare" : "tasks",
  }, {
    done: agents.length > 0,
    label: agents.length ? "Perfil de agente cadastrado" : "Cadastre um perfil de agente",
    tab: "agents",
  }];
  const free = new Set(freeAgents);
  const hasFreeAgent = agents.some((agent) => free.has(agent.agentValue));
  if (agents.length && hasFreeAgent) {
    checks.push({ done: true, label: "Caminho gratuito disponível: este agente dispensa modelo e credencial", tab: "agents" });
  } else if (agents.length) {
    checks.push({ done: models.length > 0, label: "Modelo cadastrado para o agente pago", tab: "models" });
    checks.push({ done: secretNames.length > 0, label: "Credencial disponível para o agente pago", tab: "secrets" });
  }
  return checks;
}
