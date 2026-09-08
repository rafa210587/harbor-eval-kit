import { $, $$, api, escapeHtml, activateTab } from "./core.js";
import { runDeleteAction } from "./ui-actions.js";
import { harnessAuthFields, catalogEntries, discoveredModelIds, integrationRequest, integrationSummary } from "./harness-integrations-domain.js";

let refreshHarnessIntegrationsImpl = async () => [];
export async function refreshHarnessIntegrations() { return refreshHarnessIntegrationsImpl(); }

function mountHarnessIntegrations() {
  const host = $("#tab-secrets");
  if (!host || $("#harness-integrations")) return;
  const section = document.createElement("details");
  section.id = "harness-integrations";
  section.className = "panel";
  section.innerHTML = `<summary><strong>Integrações de CLI e harness</strong></summary>
    <p class="hint">Cadastre uma conexão reutilizável com o adapter do Harbor. Fluxo: escolha o CLI, confira a capacidade e versão, vincule autenticação, diagnostique e só então escolha o modelo no perfil de agente ou juiz.</p>
    <p class="persistent-hint">Modo API e login nativo são vínculos locais distintos das credenciais Git e de inferência direta. Nos dois modos, o código de um repositório confiável pode acessar a identidade exigida pelo CLI. Nenhum modo recebe Git ou o gabarito. Cursor/OpenCode nativo permanece bloqueado enquanto o catálogo do adapter não comprovar suporte.</p>
    <p id="harness-status" class="status-line" role="status" aria-live="polite"></p>
    <form id="harness-form">
      <label for="harness-label">Nome da integração</label><input type="text" id="harness-label" data-field-help="off" aria-describedby="harness-label-help" required placeholder="Codex nativo — equipe"><p id="harness-label-help" class="hint">Nome reutilizado por vários perfis. Ex.: Codex nativo — equipe. Obrigatório.</p>
      <label for="harness-adapter">CLI / adapter</label><select id="harness-adapter" data-field-help="off" aria-describedby="harness-adapter-help"><option value="">— carregando catálogo —</option></select><p id="harness-adapter-help" class="hint">A lista e os bloqueios vêm do servidor. Estar no catálogo não certifica autenticação, modelo, skills ou execução nesta máquina.</p>
      <label for="harness-version">Versão esperada</label><input type="text" id="harness-version" data-field-help="off" aria-describedby="harness-version-help" placeholder="ex.: 1.2.3"><p id="harness-version-help" class="hint">Opcional. Fixe quando a capacidade depende da versão; Diagnosticar mostra a versão realmente encontrada.</p>
      <label for="harness-auth">Autenticação</label><select id="harness-auth" data-field-help="off" aria-describedby="harness-auth-help"><option value="api">Chave de API</option><option value="native">Login/assinatura nativa</option></select><p id="harness-auth-help" class="hint persistent-hint"></p>
      <div id="harness-api-auth"><label for="harness-credential-env">Variável da credencial</label><input type="text" id="harness-credential-env" data-field-help="off" aria-describedby="harness-api-help" placeholder="ANTHROPIC_API_KEY"><details><summary>Endpoint avançado</summary><label for="harness-base-url">Base URL</label><input type="text" id="harness-base-url" data-field-help="off" aria-describedby="harness-api-help" placeholder="https://api.exemplo/v1"></details><p id="harness-api-help" class="hint">Informe somente o nome da variável salva em Credenciais, nunca o valor. Base URL é opcional e depende do adapter.</p></div>
      <div id="harness-oauth-auth" hidden><label for="harness-oauth-env">Variável do token OAuth da sessão Claude</label><input type="text" id="harness-oauth-env" data-field-help="off" aria-describedby="harness-oauth-help" placeholder="CLAUDE_CODE_OAUTH_TOKEN"><p id="harness-oauth-help" class="hint persistent-hint">Vincule o nome da variável da sessão dedicada, cadastrada nesta aba como credencial customizada. Não é uma API key: informe apenas o nome, nunca o token. A assinatura precisa autorizar o modelo escolhido.</p></div>
      <div id="harness-native-auth" hidden><label for="harness-auth-file">Arquivo de autenticação local</label><input type="text" id="harness-auth-file" data-field-help="off" aria-describedby="harness-native-help" placeholder="caminho local exigido pelo CLI"><p id="harness-native-help" class="hint persistent-hint">Obrigatório para executar Codex nativo; ao editar, vazio preserva o vínculo existente. O caminho é enviado para configuração local, não reaparece na lista nem entra em export. O código confiável ainda pode acessar essa identidade dentro do ambiente do CLI.</p></div>
      <label class="checkbox-inline"><input id="harness-trusted" type="checkbox" data-field-help="off" aria-describedby="harness-trusted-help"> Usar somente com repositórios confiáveis</label><p id="harness-trusted-help" class="hint persistent-hint">Obrigatório. Esta confirmação não concede acesso ao repositório de referência, credencial Git ou gabarito.</p>
      <div id="harness-capability" class="hint"></div><button id="harness-save" class="primary" type="submit">Salvar integração</button>
    </form><div id="harness-list"></div>`;
  host.appendChild(section);
  section.querySelectorAll("input,select,textarea").forEach(field => { field.dataset.fieldHelp = "off"; });

  let catalog = [], integrations = [], busy = false, editingId = "";
  const status = $("#harness-status"), form = $("#harness-form");
  function draft() { return { label: $("#harness-label").value, adapter: $("#harness-adapter").value, version: $("#harness-version").value, authMode: $("#harness-auth").value, credentialEnv: $("#harness-auth").value === "native" ? $("#harness-oauth-env").value : $("#harness-credential-env").value, baseUrl: $("#harness-base-url").value, authFilePath: $("#harness-auth-file").value, trustedRepository: $("#harness-trusted").checked }; }
  function setFormLocked(locked) { busy = locked; $$("input, select, button", form).forEach((control) => { control.disabled = locked; }); }
  function renderAuth() {
    const native = $("#harness-auth").value === "native";
    const fields = harnessAuthFields($("#harness-adapter").value, $("#harness-auth").value);
    $("#harness-api-auth").hidden = !fields.api; $("#harness-native-auth").hidden = !fields.authFile;
    $("#harness-oauth-auth").hidden = !fields.oauth;
    $("#harness-api-auth details").hidden = native;
    $("#harness-auth-help").textContent = native ? "Login nativo usa a identidade do CLI e pode ficar acessível ao código confiável. O catálogo informa quais adapters suportam este modo." : "API vincula o nome de uma variável já salva; não copie a chave para este formulário.";
    const item = catalog.find((entry) => entry.adapter === $("#harness-adapter").value);
    const blocked = !item ? ["Escolha um adapter."] : [...(!item.supported ? ["Adapter bloqueado."] : []), ...(item.authModes.length && !item.authModes.includes(native ? "native" : "api") ? [`Modo ${native ? "nativo" : "API"} indisponível.`] : []), ...item.blockers];
    $("#harness-capability").textContent = item ? `${item.modelDiscovery ? "Descoberta de modelos declarada." : "Descoberta automática indisponível; cadastre o ID manualmente em Modelos."}${blocked.length ? ` Impedimento: ${blocked.join(" ")}` : ""}` : "";
    $("#harness-capability").style.color = blocked.length ? "var(--warn)" : "";
  }
  function renderHarnessCatalog() { $("#harness-adapter").innerHTML = '<option value="">— escolher CLI —</option>' + catalog.map((item) => `<option value="${escapeHtml(item.adapter)}">${escapeHtml(item.label)}${item.supported ? "" : " — bloqueado"}</option>`).join(""); renderAuth(); }
  function operationResult(result, type, target) {
    target.style.color = type === "models" || result?.available !== true || result?.requestedVersionMatches === false ? "var(--warn)" : "var(--ok)";
    if (type === "models") {
      const models = discoveredModelIds(result); target.innerHTML = models.length ? `<p>${models.length} modelo(s) informado(s) pelo CLI nesta versão:</p><ul>${models.map((model) => `<li><code>${escapeHtml(model)}</code></li>`).join("")}</ul><button type="button" class="secondary" data-open-models>Cadastrar ID manualmente em Modelos</button>` : `<p>${escapeHtml(result?.message || "")} Nenhum modelo foi descoberto. Isso não autoriza inferir um padrão; cadastre o identificador exato manualmente em Modelos.</p>`; $("[data-open-models]", target)?.addEventListener("click", () => activateTab("models"));
    } else {
      target.textContent = `${result?.available === true ? "CLI disponível no host" : "CLI indisponível ou versão não reconhecida"}${result?.version ? ` · versão ${result.version}` : ""}${result?.requestedVersionMatches === false ? " · versão diferente da configurada" : ""}. ${result?.message || ""} Nenhuma inferência foi enviada.`;
    }
  }
  async function runHarnessAction(item, type, button, target) {
    if (busy || button.disabled) return;
    busy = true; button.disabled = true;
    const label = button.textContent, started = Date.now();
    const timer = setInterval(() => { button.textContent = `${label} ${Math.floor((Date.now() - started) / 1000)}s`; }, 1000);
    target.textContent = "Consultando o CLI; nenhuma inferência será enviada.";
    try {
      const response = await api("POST", `/api/harness-integrations/${encodeURIComponent(item.id)}/${type === "models" ? "models" : "diagnose"}`, {});
      operationResult(response, type, target);
    } catch (error) { target.textContent = `Erro: ${error.message}`; }
    finally { clearInterval(timer); button.textContent = label; button.disabled = false; busy = false; }
  }
  function renderList() {
    const list = $("#harness-list"); list.innerHTML = integrations.length ? "" : '<p class="muted">Nenhuma integração configurada.</p>';
    for (const item of integrations) {
      const row = document.createElement("div"); row.className = "row"; row.innerHTML = `<div class="row-main"><div class="row-title">${escapeHtml(item.label)}</div><div class="row-sub">${escapeHtml(integrationSummary(item))}</div><p class="row-action-status status-line" role="status" aria-live="polite"></p></div><div class="row-actions"><button class="secondary" type="button" data-edit>Editar integração</button><button class="secondary" type="button" data-diagnose>Diagnosticar</button><button class="secondary" type="button" data-models>Descobrir modelos</button><button type="button" class="danger" data-delete>Remover</button></div>`;
      $("[data-edit]", row).onclick = () => {
        if (busy) return;
        editingId = item.id;
        for (const [field, value] of Object.entries({ label: item.label, adapter: item.adapter, version: item.version || "", auth: item.authMode, "credential-env": item.authMode === "api" ? item.credentialEnv || "" : "", "oauth-env": item.authMode === "native" ? item.credentialEnv || "" : "", "base-url": item.baseUrl || "", "auth-file": "" })) $("#harness-" + field).value = value;
        $("#harness-trusted").checked = item.trustedRepository;
        renderAuth(); $("#harness-label").focus(); status.textContent = `Editando ${item.label}. Salvar atualiza a conexão e preserva o arquivo nativo já vinculado quando deixado vazio.`;
      };
      const target = $(".row-action-status", row); $("[data-diagnose]", row).onclick = (event) => runHarnessAction(item, "diagnose", event.currentTarget, target); $("[data-models]", row).onclick = (event) => runHarnessAction(item, "models", event.currentTarget, target);
      $("[data-delete]", row).onclick = () => runDeleteAction(async () => { await api("DELETE", `/api/harness-integrations/${encodeURIComponent(item.id)}`); await refreshHarnessIntegrations(); }, { setLocked: (locked) => $$('button', row).forEach((button) => { button.disabled = locked; }), setError: (message) => { target.textContent = message; } }); list.appendChild(row);
    }
  }
  refreshHarnessIntegrationsImpl = async () => { const response = await api("GET", "/api/harness-integrations"); integrations = Array.isArray(response) ? response : response.integrations || []; renderList(); document.dispatchEvent(new CustomEvent("hek:harness-integrations-refreshed", { detail: { integrations: integrations.map((item) => ({ ...item, authFilePath: undefined })) } })); return integrations; };
  form.addEventListener("submit", async (event) => { event.preventDefault(); if (busy) return; setFormLocked(true); try { const saved = await api("POST", "/api/harness-integrations", { ...integrationRequest(draft(), catalog), ...(editingId ? { id: editingId } : {}) }); editingId = ""; form.reset(); renderAuth(); await refreshHarnessIntegrations(); status.textContent = `Integração ${saved.label || "salva"}. Diagnostique antes de vinculá-la a um perfil.`; } catch (error) { status.textContent = `Erro: ${error.message}`; } finally { setFormLocked(false); } });
  $("#harness-auth").onchange = renderAuth; $("#harness-adapter").onchange = renderAuth;
  Promise.all([api("GET", "/api/harness-integrations/catalog"), refreshHarnessIntegrations()]).then(([response]) => { catalog = catalogEntries(response); renderHarnessCatalog(); status.textContent = catalog.length ? "Catálogo carregado. Nenhuma CLI foi executada." : "O servidor não informou adapters; não é seguro inferir capacidades."; }).catch((error) => { status.textContent = `Não foi possível carregar integrações: ${error.message}`; $("#harness-adapter").innerHTML = '<option value="">— catálogo indisponível —</option>'; });
}

mountHarnessIntegrations();
