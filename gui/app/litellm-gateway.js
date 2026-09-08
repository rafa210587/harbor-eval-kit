// Optional gateway controls. Status is local; discovery/test only run on explicit clicks.
import { $, $$, api, escapeHtml } from "./core.js";
import { state, onRefresh, refreshAll } from "./state.js";
import { registerDiscoveredModels } from "./provider-domain.js";
import { gatewayModelChoices } from "./litellm-domain.js";

const panel = document.createElement("div");
panel.className = "panel";
panel.id = "litellm-gateway";
panel.innerHTML = `<h2>Gateway LiteLLM (opcional)</h2>
  <p class="hint">Centraliza acesso aos modelos publicados pelo seu proxy. Use esta seção quando tiver um gateway; sem ele, continue com as credenciais diretas acima. Salve uma chave de inferência do proxy como variável customizada — não a chave administrativa. As chaves dos providers ficam no servidor LiteLLM.</p>
  <p id="gateway-status" class="status-line" role="status"></p>
  <p class="hint">Configuração manual: copie <code>config/litellm-gateway.example.json</code> para <code>~/.harbor-eval-kit/litellm-gateway.json</code>, ajuste os endereços e habilite <code>enabled</code> quando houver um proxy disponível. Salve <code>LITELLM_INFERENCE_KEY</code> no formulário acima (ou o nome definido em <code>inferenceKeyEnv</code>). O padrão permanece desligado.</p>
  <p class="hint persistent-hint">Descobrir consulta <code>/v1/models</code> pelo host e não envia completion. Isso não comprova acesso dos containers: <code>hostBaseUrl</code> e <code>containerBaseUrl</code> precisam funcionar nos respectivos ambientes. Validar uma execução Harbor real continua necessário.</p>
  <div class="row-actions"><button id="gateway-refresh" type="button">Atualizar estado</button><button id="gateway-discover" type="button">Descobrir modelos do gateway</button></div>
  <div id="gateway-catalog"></div>
  <p id="gateway-action-status" role="status" aria-live="polite" class="status-line"></p>`;
$("#tab-secrets").appendChild(panel);
const actionStatus = $("#gateway-action-status");
let choices = [];
let busy = false;

function updateButtons() {
  $$("button, input, select", panel).forEach((control) => { control.disabled = busy; });
  $("#gateway-discover").disabled = busy || !state.gateway?.enabled || !state.gateway?.configured || !state.gateway?.hasCredential;
  $$("input[data-registered]", panel).forEach((input) => { input.disabled = true; });
}

function renderStatus() {
  const gateway = state.gateway;
  $("#gateway-status").textContent = state.gatewayError
    ? `Não foi possível ler a configuração: ${state.gatewayError}`
    : !gateway?.enabled ? "Desligado. Nenhuma conexão com LiteLLM foi feita."
    : !gateway.configured ? "Habilitado; configure hostBaseUrl no arquivo litellm-gateway.json para descobrir e testar modelos pelo host."
    : !gateway.hasCredential ? `Habilitado; falta salvar ${gateway.inferenceKeyEnv} no formulário de credenciais.`
    : "Habilitado, credencial salva. Use Descobrir para consultar os aliases permitidos para essa chave.";
  if (!gateway?.enabled || !gateway?.configured || !gateway?.hasCredential) {
    choices = [];
    renderCatalog();
  }
  updateButtons();
}

async function runAction(message, action) {
  if (busy) return;
  busy = true;
  updateButtons();
  const started = Date.now();
  const tick = () => { actionStatus.textContent = `${message} (${Math.floor((Date.now() - started) / 1000)}s)`; };
  tick();
  const timer = setInterval(tick, 1000);
  try { await action(); }
  catch (error) { actionStatus.textContent = `Erro: ${error.message}`; }
  finally { clearInterval(timer); busy = false; updateButtons(); }
}

function renderCatalog() {
  const box = $("#gateway-catalog");
  const registered = new Set(state.models.map((model) => model.value));
  box.innerHTML = choices.length ? `<p id="gateway-picker-help" class="hint">Marque os aliases que deseja cadastrar em Modelos. Nenhum novo vem marcado. O prefixo <code>openai/</code> seleciona o transporte compatível; o alias do proxy é preservado, inclusive suas barras.</p>
    <div role="group" aria-describedby="gateway-picker-help">${choices.map(({ alias, value }) => `<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" value="${escapeHtml(value)}" ${registered.has(value) ? 'checked disabled data-registered="true"' : ""}>${escapeHtml(alias)} → ${escapeHtml(value)}${registered.has(value) ? " (já cadastrado)" : ""}</label>`).join("")}</div>
    <button id="gateway-register" type="button">Cadastrar aliases marcados</button>
    <label for="gateway-test-model">Alias exato para o teste pago</label>
    <select id="gateway-test-model" aria-describedby="gateway-test-help"><option value="">— escolha um alias descoberto —</option>${choices.map(({ alias }) => `<option value="${escapeHtml(alias)}">${escapeHtml(alias)}</option>`).join("")}</select>
    <p id="gateway-test-help" class="hint persistent-hint">Opcional. Testar envia uma pequena completion real pelo host, com possível custo. Padrão: nenhum modelo; nada roda ao descobrir ou cadastrar.</p>
    <button id="gateway-test" type="button">Testar alias escolhido (pago)</button>` : "";
  $("#gateway-register")?.addEventListener("click", () => {
    const selected = $$("input:checked:not([data-registered])", box).map((input) => input.value);
    return runAction("Cadastrando aliases", async () => {
      await registerDiscoveredModels(selected, {
        api, refreshAll,
        setStatus: (message) => { actionStatus.textContent = message; },
      });
      renderCatalog();
    });
  });
  $("#gateway-test")?.addEventListener("click", () => {
    const model = $("#gateway-test-model").value;
    if (!choices.some(({ alias }) => alias === model)) { actionStatus.textContent = "Escolha um alias descoberto antes do teste pago."; return; }
    return runAction("Testando alias no gateway", async () => {
      const result = await api("POST", "/api/litellm/test", { model });
      if (!result.ok) throw new Error(result.error || "O gateway recusou o teste.");
      actionStatus.textContent = `O alias ${result.testedModel} respondeu pelo host. O acesso dentro dos containers ainda precisa de uma execução real.`;
    });
  });
  updateButtons();
}

$("#gateway-refresh").addEventListener("click", () => runAction("Lendo configuração local", async () => {
  choices = [];
  renderCatalog();
  await refreshAll();
  actionStatus.textContent = state.gatewayError ? `Erro: ${state.gatewayError}` : "Estado atualizado. Nenhuma completion enviada.";
}));
$("#gateway-discover").addEventListener("click", () => runAction("Consultando catálogo do gateway", async () => {
  choices = [];
  renderCatalog();
  const result = await api("GET", "/api/litellm/models");
  choices = gatewayModelChoices(result.models);
  renderCatalog();
  actionStatus.textContent = choices.length ? `${choices.length} alias(es) encontrados; nenhuma completion enviada.` : "Nenhum alias disponível para essa chave. Confira o catálogo e as permissões no proxy.";
}));
onRefresh(renderStatus);
renderStatus();
