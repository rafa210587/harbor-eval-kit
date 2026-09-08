// Shared client state, the status bar, and the refresh cycle.
//
// refreshAll used to call sixteen render functions by name, which meant this file had to
// know every feature module and no module could be added without editing it. Feature
// modules now register themselves with onRefresh(); adding a tab touches nothing here.

import { $, api, escapeHtml } from "./core.js";

// ---------- status ----------
export async function loadStatus() {
  const bar = $("#statusBar");
  try {
    const s = await api("GET", "/api/status");
    const ok = s.harbor.available && s.podman.infoOk && s.podman.dockerHost;
    const dockerHostBit = s.podman.dockerHost ? "" : "  ·  ⚠ DOCKER_HOST não resolvido pra este SO/config — harbor run --env docker provavelmente vai falhar";
    bar.textContent = `Harbor: ${s.harbor.available ? s.harbor.version : "missing"}  ·  Podman: ${s.podman.available ? s.podman.version : "missing"}${s.podman.infoOk ? "" : " (info FAIL)"} (${s.platform})${dockerHostBit}`;
    bar.className = ok ? "ok" : "warn";
  } catch (e) {
    bar.textContent = "status check failed: " + e.message;
    bar.className = "warn";
  }
}


// ---------- provider -> expected API key convention (same one Harbor/LiteLLM use) ----------
// Single source of truth: feeds the Models "expected key" badge AND the Secrets provider dropdown.
// Fetched from GET /api/providers on refreshAll() -- canonical list now lives server-side
// (scripts/lib/harbor.ts) so the Secrets/Models UI and the key-test route share one source
// of truth instead of two independently-maintained lists.
export let PROVIDERS = [];
export function findProviderByModelValue(modelValue) {
  const v = (modelValue || "").toLowerCase().trim();
  return PROVIDERS.find((p) => p.prefixes.some((pre) => v.startsWith(pre)));
}
export function guessProviderKey(modelValue) {
  const v = (modelValue || "").toLowerCase().trim();
  if (!v.includes("/")) return null;
  const known = findProviderByModelValue(v);
  if (known) return known.envKey;
  const prefix = v.split("/")[0];
  return prefix ? `${prefix.toUpperCase()}_API_KEY` : null;
}
export function keyStatusBadge(modelValue) {
  if (String(modelValue || "").startsWith("openai/") && state.gateway?.enabled) {
    const has = state.gateway.hasCredential;
    return `<span class="badge" style="color:var(--${has ? "ok" : "warn"});">${has ? "✓" : "⚠ falta"} gateway: ${escapeHtml(state.gateway.inferenceKeyEnv || "credencial de inferência")}</span>`;
  }
  const known = findProviderByModelValue(modelValue);
  if (known && known.envKey === null) return `<span class="badge">${escapeHtml(known.label)}</span>`;
  const key = guessProviderKey(modelValue);
  if (!key) return "";
  const has = state.secretNames.includes(key);
  return has
    ? `<span class="badge" style="color:var(--ok);border-color:var(--ok);">✓ ${escapeHtml(key)}</span>`
    : `<span class="badge" style="color:var(--warn);border-color:var(--warn);">⚠ falta ${escapeHtml(key)}</span>`;
}


// ---------- shared registry state ----------
export const state = { agents: [], models: [], skills: [], skillsets: [], criteria: [], rubrics: [], judges: [], secretNames: [], judgeModels: [], harborAgents: [], freeAgents: [], gateway: null, gatewayError: "" };

// The --agent values the installed Harbor accepts, offered as autocomplete on both the Agents
// and Judges forms. Kept as a <datalist> rather than a <select> on purpose: harbor also takes
// a custom import path (module.path:ClassName) and ACP shorthands, so the field must stay free.
export function renderHarborAgentsDatalist() {
  const dl = $("#harbor-agents-list");
  if (!dl) return;
  dl.innerHTML = state.harborAgents
    .map((a) => {
      const tags = [];
      if (a.modelAgnostic) tags.push("model-agnostic");
      if (state.freeAgents.includes(a.value)) tags.push("sem custo de API");
      return `<option value="${escapeHtml(a.value)}"${tags.length ? ` label="${escapeHtml(tags.join(" · "))}"` : ""}></option>`;
    })
    .join("");
  const countEl = $("#harbor-agents-count");
  if (countEl) countEl.textContent = String(state.harborAgents.length);
}


// ---------- refresh cycle ----------
const renderers = [];

/** Registers a function to run after every registry refresh. */
export function onRefresh(fn) { renderers.push(fn); }

export async function refreshAll() {
  state.models = await api("GET", "/api/models");
  state.skills = await api("GET", "/api/skills");
  state.skillsets = await api("GET", "/api/skillsets");
  state.agents = await api("GET", "/api/agents");
  state.criteria = await api("GET", "/api/criteria");
  state.rubrics = await api("GET", "/api/rubrics");
  state.judges = await api("GET", "/api/judges");
  state.secretNames = await api("GET", "/api/secrets");
  try {
    state.gateway = await api("GET", "/api/litellm/status");
    state.gatewayError = "";
  } catch (error) {
    state.gateway = null;
    state.gatewayError = error.message;
  }
  if (state.judgeModels.length === 0) state.judgeModels = await api("GET", "/api/judge-models");
  if (PROVIDERS.length === 0) PROVIDERS = await api("GET", "/api/providers");
  if (state.harborAgents.length === 0) {
    const ha = await api("GET", "/api/harbor-agents");
    state.harborAgents = ha.agents || [];
    state.freeAgents = ha.freeAgents || [];
    renderHarborAgentsDatalist();
  }

  for (const render of renderers) render();
}
