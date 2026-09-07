// Agents: a usage profile (which harbor --agent, default model, instructions, skill sets).
import { $, $$, api, escapeHtml, makeRow, checkboxGroup } from "./core.js";
import { wireEditableForm } from "./forms.js";
import { state, onRefresh, refreshAll } from "./state.js";

// ================= AGENTS =================
const agentsForm = $("#agents-form");
agentsForm.dataset.apiPath = "/api/agents";
const agentsEdit = wireEditableForm(agentsForm, {
  addLabel: "Add agent",
  onSubmit: (form) => ({
    label: form.label.value,
    agentValue: form.agentValue.value,
    modelId: form.modelId.value || undefined,
    instructions: form.instructions.value,
    defaultSkillsetIds: $$('input[name=defaultSkillsetIds]:checked', form).map((i) => i.value),
    notes: form.notes.value,
  }),
});

function renderAgentModelSelect(selectedId = "") {
  const sel = $("#agent-model-select");
  sel.innerHTML = '<option value="">— nenhum (usa o padrão do Harbor) —</option>' +
    state.models.map((m) => `<option value="${escapeHtml(m.id)}" ${m.id === selectedId ? "selected" : ""}>${escapeHtml(m.label)}</option>`).join("");
}

function renderAgentDefaultSkillsetPicker(checkedIds = []) {
  checkboxGroup($("#agent-default-skillsets"), state.skillsets, { name: "defaultSkillsetIds", checkedIds });
}

function renderAgentsList() {
  const list = $("#agents-list");
  list.innerHTML = state.agents.length ? "" : '<p class="muted">Nothing registered yet.</p>';
  for (const item of state.agents) {
    const modelLabel = state.models.find((m) => m.id === item.modelId)?.label;
    const bits = [`agent: ${item.agentValue}`];
    if (modelLabel) bits.push(`model: ${modelLabel}`);
    if (item.instructions && item.instructions.trim()) bits.push("+instructions");
    if (item.defaultSkillsetIds && item.defaultSkillsetIds.length) bits.push(`+${item.defaultSkillsetIds.length} skill set(s)`);
    if (item.notes) bits.push(item.notes);
    list.appendChild(makeRow(item, {
      title: item.label,
      sub: bits.join(" · "),
      onEdit: () => agentsEdit.startEdit(item.id, () => {
        agentsForm.label.value = item.label;
        agentsForm.agentValue.value = item.agentValue;
        agentsForm.instructions.value = item.instructions || "";
        agentsForm.notes.value = item.notes || "";
        renderAgentModelSelect(item.modelId || "");
        renderAgentDefaultSkillsetPicker(item.defaultSkillsetIds || []);
      }),
      onDelete: async () => { await api("DELETE", `/api/agents/${item.id}`); await refreshAll(); },
    }));
  }
}


// Registered with the refresh cycle instead of being called by name from state.js --
// see the note at the top of state.js.
onRefresh(() => { renderAgentsList(); renderAgentModelSelect(); renderAgentDefaultSkillsetPicker(); });
