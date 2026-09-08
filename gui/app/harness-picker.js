import { $, escapeHtml, activateTab } from "./core.js";

// One picker shared by candidate and judge profiles; connection editing lives in Credentials.
export function installHarnessPicker(form) {
  const field = document.createElement("div");
  field.innerHTML = '<label>Conexão de CLI (opcional)<select name="integrationId" data-field-help="off"><option value="">Padrão atual do Harbor</option></select></label><p class="hint">Reutiliza autenticação e versão cadastradas em Credenciais. O adapter do perfil deve coincidir; sem conexão, mantém API/LiteLLM do fluxo atual.</p><button type="button" class="secondary">Configurar conexões em Credenciais</button>';
  form.querySelector('button[type="submit"]').before(field);
  field.querySelector("button").onclick = () => {
    activateTab("secrets");
    const section = $("#harness-integrations");
    if (section) { section.open = true; section.scrollIntoView({ block: "start" }); }
  };
  let integrations = [];
  const render = (selected = form.integrationId.value) => {
    form.integrationId.innerHTML = '<option value="">Padrão atual do Harbor</option>' + integrations.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)} · ${escapeHtml(item.adapter)}</option>`).join("");
    if (selected && !integrations.some(item => item.id === selected)) form.integrationId.add(new Option("Conexão local ausente — reconecte", selected));
    form.integrationId.value = selected;
  };
  document.addEventListener("hek:harness-integrations-refreshed", event => { integrations = event.detail.integrations; render(); });
  return render;
}
