// Secrets: provider API keys. Values are write-only from this UI -- the API returns names.
import { $, $$, api, escapeHtml } from "./core.js";
import { state, onRefresh, refreshAll, PROVIDERS, guessProviderKey, findProviderByModelValue } from "./state.js";
import { tabRefreshers } from "./core.js";
import { describeField } from "./field-help.js";
import { runDeleteAction } from "./ui-actions.js";
import { normalizeDiscoveredModels, registerDiscoveredModels } from "./provider-domain.js";

function currentSecretResult(envKey) {
  return [...document.querySelectorAll("#secrets-list .row")]
    .find((row) => row.querySelector(".row-title")?.textContent === envKey)
    ?.querySelector(".secret-test-result");
}

// ================= SECRETS =================
function renderSecretsList() {
  const list = $("#secrets-list");
  list.innerHTML = state.secretNames.length ? "" : '<p class="muted">No keys registered yet.</p>';
  for (const n of state.secretNames) {
    const row = document.createElement("div");
    row.className = "row";
    row.style.flexDirection = "column";
    row.style.alignItems = "stretch";
    const provider = PROVIDERS.find((p) => p.envKey === n);
    const compatibleModels = state.models.filter((model) => guessProviderKey(model.value) === n);
    row.innerHTML = `<div class="secret-row-head">
      <div class="row-main"><div class="row-title">${escapeHtml(n)}</div><div class="row-sub">Valor protegido; escolha explicitamente o modelo antes do teste pago.</div></div>
      <div class="row-actions"></div>
    </div>
    <label>Modelo para o teste</label>
    <select class="secret-test-model" aria-label="Modelo exato para testar ${escapeHtml(n)}">
      <option value="">— escolha um modelo cadastrado —</option>
      ${compatibleModels.map((model) => `<option value="${escapeHtml(model.value)}">${escapeHtml(model.label)} (${escapeHtml(model.value)})</option>`).join("")}
    </select>
    <p class="hint persistent-hint" style="color:var(--warn);">⚠ Testar faz uma pequena chamada paga ao modelo exato selecionado. Nada é testado automaticamente ao salvar.</p>
    <div class="secret-test-result" style="margin-top:6px;"></div>`;
    const actions = row.querySelector(".row-actions");
    const resultEl = row.querySelector(".secret-test-result");
    const modelSelect = row.querySelector(".secret-test-model");
    describeField(modelSelect, `Escolhe o modelo exato da pequena chamada paga. Ex.: ${provider?.id || "provider"}/modelo. Padrão: nenhum; obrigatório para testar.`);

    const testBtn = document.createElement("button");
    testBtn.textContent = "Testar modelo escolhido";
    testBtn.onclick = async () => {
      const model = modelSelect.value;
      if (!model) { resultEl.textContent = "Escolha o modelo exato antes de testar."; modelSelect.focus(); return; }
      testBtn.disabled = true;
      testBtn.textContent = "Testando…";
      resultEl.innerHTML = `<p class="hint status-line">Fazendo uma pequena chamada real no modelo <code>${escapeHtml(model)}</code>…</p>`;
      try {
        const res = await api("POST", "/api/secrets/test", { name: n, model });
        renderSecretTestResult(resultEl, n, res);
      } catch (err) {
        resultEl.innerHTML = `<p class="hint status-line" style="color:var(--err);">Erro: ${escapeHtml(err.message)}</p>`;
      }
      testBtn.disabled = false;
      testBtn.textContent = "Testar modelo escolhido";
    };
    actions.appendChild(testBtn);

    if (provider) {
      const discoverBtn = document.createElement("button");
      discoverBtn.textContent = "Descobrir modelos";
      discoverBtn.onclick = async () => {
        discoverBtn.disabled = true;
        resultEl.textContent = "Consultando o catálogo do provider; nenhuma completion será enviada…";
        try {
          const response = await api("GET", `/api/providers/${encodeURIComponent(provider.id)}/models?envKey=${encodeURIComponent(n)}`);
          if (response.ok === false) throw new Error(response.error || "Provider não retornou o catálogo");
          resultEl.textContent = "Consulta concluída; nenhuma completion enviada.";
          const discovered = Array.isArray(response)
            ? response
            : response.models || response.discoveredModels || [];
          renderDiscoveredModels(resultEl, n, provider, discovered);
        } catch (err) { resultEl.textContent = `Erro ao descobrir modelos: ${err.message}`; }
        finally { discoverBtn.disabled = false; }
      };
      actions.appendChild(discoverBtn);
    }

    const del = document.createElement("button");
    del.textContent = "Remover";
    del.className = "danger";
    del.onclick = () => runDeleteAction(async () => {
      await api("DELETE", `/api/secrets/${n}`);
      await refreshAll();
    }, {
      setLocked: (locked) => { $$('button', actions).forEach((button) => { button.disabled = locked; }); },
      setError: (message) => {
        resultEl.textContent = message;
        resultEl.className = "secret-test-result status-line";
        resultEl.style.color = message ? "var(--err)" : "";
      },
    });
    actions.appendChild(del);
    list.appendChild(row);
  }
}

function renderSecretTestResult(resultEl, envKey, res) {
  if (res.ok) {
    resultEl.innerHTML = `<p class="hint status-line" style="color:var(--ok);">✓ Credencial funciona — o modelo <code>${escapeHtml(res.testedModel)}</code> respondeu normalmente.</p>`;
  } else {
    resultEl.innerHTML = `<p class="hint status-line" style="color:var(--err);">✗ Falhou: ${escapeHtml(res.error || "erro desconhecido")}</p>`;
  }
  if (res.discoveredModels && res.discoveredModels.length) {
    const provider = findProviderByModelValue(res.testedModel) || PROVIDERS.find((p) => p.envKey === envKey);
    renderDiscoveredModels(resultEl, envKey, provider, res.discoveredModels);
  }
}

function renderDiscoveredModels(resultEl, envKey, provider, discoveredModels) {
  const discovered = normalizeDiscoveredModels(discoveredModels, provider?.id);
  if (!discovered.length) {
    const empty = document.createElement("p");
    empty.textContent = "O provider não retornou modelos; você pode cadastrar um identificador manualmente em Modelos.";
    resultEl.appendChild(empty);
  }
  if (discovered.length) {
    const existingValues = new Set(state.models.map((m) => m.value));
    const pickerId = `discovered-${envKey}-${Date.now()}`;
    const helpId = `${pickerId}-help`;
    const items = discovered.map((m) => {
      const value = m;
      const already = existingValues.has(value);
      return `<label style="display:flex;align-items:center;gap:5px;"><input type="checkbox" value="${escapeHtml(value)}" aria-describedby="${helpId}" ${already ? "disabled checked" : ""}> ${escapeHtml(value)}${already ? " (já cadastrado)" : ""}</label>`;
    }).join("");
    const box = document.createElement("div");
    box.className = "panel";
    box.style.marginTop = "8px";
    box.innerHTML = `<p id="${helpId}" class="hint">Finalidade: escolher quais modelos descobertos cadastrar. Exemplo: marque somente os que pretende avaliar. Padrão: nenhum; opcional.</p>
      <div id="${pickerId}" role="group" aria-describedby="${helpId}" style="display:flex;flex-direction:column;gap:4px;">${items}</div>
      <button class="secondary" type="button" style="margin-top:8px;">Cadastrar marcados</button>`;
    const registerBtn = box.querySelector("button");
    registerBtn.addEventListener("click", async () => {
      const values = $$(`#${pickerId} input:checked:not(:disabled)`).map((checkbox) => checkbox.value);
      await registerDiscoveredModels(values, {
        api,
        refreshAll,
        setLocked: (locked) => {
          registerBtn.disabled = locked;
          registerBtn.textContent = locked ? "Cadastrando…" : "Cadastrar marcados";
        },
        setStatus: (message) => {
          // refreshAll replaces the row; resolve the live status node so the
          // success/error response remains visible after the refresh.
          const liveResult = currentSecretResult(envKey) || resultEl;
          liveResult.textContent = message;
          liveResult.className = "secret-test-result status-line";
          liveResult.style.color = message.startsWith("Erro") ? "var(--err)" : "";
        },
      });
    });
    resultEl.appendChild(box);
  }
}
tabRefreshers.secrets = refreshAll;

function renderProviderSelect() {
  $("#secret-provider-select").innerHTML =
    '<option value="">— outro / customizado —</option>' +
    PROVIDERS.filter((p) => p.envKey).map((p) => `<option value="${p.envKey}">${escapeHtml(p.label)} (${p.envKey})</option>`).join("");
}

$("#secret-provider-select").addEventListener("change", (e) => {
  const nameInput = $("#secret-name-input");
  if (e.target.value) {
    nameInput.value = e.target.value;
  } else {
    nameInput.value = "";
    nameInput.focus();
  }
});

$("#secrets-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  try {
    await api("POST", "/api/secrets", data);
    e.target.reset();
    $("#secret-provider-select").value = "";
    await refreshAll();
  } catch (err) { alert(err.message); }
});


// Registered with the refresh cycle instead of being called by name from state.js --
// see the note at the top of state.js.
onRefresh(() => { renderSecretsList(); renderProviderSelect(); });
