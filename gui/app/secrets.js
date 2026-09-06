// Secrets: provider API keys. Values are write-only from this UI -- the API returns names.
import { $, $$, api, escapeHtml } from "./core.js";
import { state, onRefresh, refreshAll, PROVIDERS, guessProviderKey, findProviderByModelValue } from "./state.js";
import { tabRefreshers } from "./core.js";

// ================= SECRETS =================
function renderSecretsList() {
  const list = $("#secrets-list");
  list.innerHTML = state.secretNames.length ? "" : '<p class="muted">No keys registered yet.</p>';
  for (const n of state.secretNames) {
    const row = document.createElement("div");
    row.className = "row";
    row.style.flexDirection = "column";
    row.style.alignItems = "stretch";
    row.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;">
      <div class="row-main"><div class="row-title">${escapeHtml(n)}</div></div>
      <div class="row-actions"></div>
    </div>
    <div class="secret-test-result" style="margin-top:6px;"></div>`;
    const actions = row.querySelector(".row-actions");
    const resultEl = row.querySelector(".secret-test-result");

    const testBtn = document.createElement("button");
    testBtn.textContent = "Test";
    testBtn.onclick = async () => {
      testBtn.disabled = true;
      testBtn.textContent = "Testando…";
      resultEl.innerHTML = `<p class="hint">Fazendo uma chamada real (mensagem "hi", max 5 tokens) no model mais barato que o LiteLLM conhece pra esse provider…</p>`;
      try {
        const res = await api("POST", "/api/secrets/test", { name: n });
        renderSecretTestResult(resultEl, n, res);
      } catch (err) {
        resultEl.innerHTML = `<p class="hint" style="color:var(--err);">Erro: ${escapeHtml(err.message)}</p>`;
      }
      testBtn.disabled = false;
      testBtn.textContent = "Test";
    };
    actions.appendChild(testBtn);

    const del = document.createElement("button");
    del.textContent = "Remove";
    del.className = "danger";
    del.onclick = async () => { await api("DELETE", `/api/secrets/${n}`); await refreshAll(); };
    actions.appendChild(del);
    list.appendChild(row);
  }
}

function renderSecretTestResult(resultEl, envKey, res) {
  if (res.ok) {
    resultEl.innerHTML = `<p class="hint" style="color:var(--ok);">✓ Key funciona — chamada de teste no model <code>${escapeHtml(res.testedModel)}</code> respondeu normalmente.</p>`;
  } else {
    resultEl.innerHTML = `<p class="hint" style="color:var(--err);">✗ Falhou: ${escapeHtml(res.error || "erro desconhecido")}</p>`;
  }
  if (res.discoveredModels && res.discoveredModels.length) {
    const provider = findProviderByModelValue(res.testedModel) || PROVIDERS.find((p) => p.envKey === envKey);
    const existingValues = new Set(state.models.map((m) => m.value));
    const pickerId = `discovered-${envKey}-${Date.now()}`;
    const items = res.discoveredModels.map((m) => {
      const value = m.includes("/") ? m : (provider ? `${provider.id}/${m}` : m);
      const already = existingValues.has(value);
      return `<label style="display:flex;align-items:center;gap:5px;"><input type="checkbox" value="${escapeHtml(value)}" ${already ? "disabled checked" : ""}> ${escapeHtml(value)}${already ? " (já cadastrado)" : ""}</label>`;
    }).join("");
    const box = document.createElement("div");
    box.className = "panel";
    box.style.marginTop = "8px";
    box.innerHTML = `<p class="hint">Models descobertos ao vivo pra este provider (via LiteLLM) — marque quais cadastrar na aba Models:</p>
      <div id="${pickerId}" style="display:flex;flex-direction:column;gap:4px;">${items}</div>
      <button class="secondary" type="button" style="margin-top:8px;">Cadastrar marcados</button>`;
    box.querySelector("button").addEventListener("click", async () => {
      const toAdd = $$(`#${pickerId} input:checked:not(:disabled)`);
      for (const cb of toAdd) {
        const value = cb.value;
        await api("POST", "/api/models", { label: value, value });
      }
      await refreshAll();
      box.innerHTML = `<p class="hint" style="color:var(--ok);">${toAdd.length} model(s) cadastrado(s).</p>`;
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
