// The judging side: criteria, reusable criterion sets (Harbor rubrics) and judges.
import { $, $$, api, escapeHtml, makeRow, checkboxGroup } from "./core.js";
import { wireEditableForm } from "./forms.js";
import { state, onRefresh, refreshAll } from "./state.js";
import { judgeNeedsValidation } from "./compare-domain.js";
import { defaultCriterionSetIds } from "./judging-domain.js";

// ================= CRITERIA =================
const criteriaForm = $("#criteria-form");
criteriaForm.dataset.apiPath = "/api/criteria";
const criteriaEdit = wireEditableForm(criteriaForm, {
  addLabel: "Adicionar critério",
  onSubmit: (form) => ({
    name: form.name.value,
    description: form.description.value,
    guidance: form.guidance.value,
  }),
});

function renderCriteriaList() {
  const list = $("#criteria-list");
  list.innerHTML = state.criteria.length ? "" : '<p class="muted">Nothing registered yet.</p>';
  for (const item of state.criteria) {
    list.appendChild(makeRow({
      title: item.name,
      sub: item.description || "",
      onEdit: () => criteriaEdit.startEdit(item.id, () => {
        criteriaForm.name.value = item.name;
        criteriaForm.description.value = item.description;
        criteriaForm.guidance.value = item.guidance;
      }),
      onDelete: async () => { await api("DELETE", `/api/criteria/${item.id}`); await refreshAll(); },
    }));
  }
}

// ================= CRITERION SETS (Harbor rubrics) =================
const rubricsForm = $("#rubrics-form");
rubricsForm.dataset.apiPath = "/api/rubrics";
const rubricsEdit = wireEditableForm(rubricsForm, {
  addLabel: "Adicionar conjunto de critérios",
  onSubmit: (form) => ({
    label: form.label.value,
    criterionIds: $$('input[name=criterionIds]:checked', form).map((i) => i.value),
  }),
});

function renderRubricCriterionPicker(checkedIds = []) {
  checkboxGroup(
    $("#rubric-criterion-picker"),
    state.criteria.map((c) => ({ id: c.id, label: c.name })),
    { name: "criterionIds", checkedIds }
  );
}
rubricsForm.addEventListener("reset-extra", () => renderRubricCriterionPicker());

function renderRubricsList() {
  const list = $("#rubrics-list");
  list.innerHTML = state.rubrics.length ? "" : '<p class="muted">Nenhum conjunto de critérios cadastrado.</p>';
  for (const item of state.rubrics) {
    const names = (item.criterionIds || []).map((id) => state.criteria.find((c) => c.id === id)?.name || "?").join(", ");
    list.appendChild(makeRow({
      title: item.label,
      sub: names || "(sem critérios)",
      onEdit: () => rubricsEdit.startEdit(item.id, () => {
        rubricsForm.label.value = item.label;
        renderRubricCriterionPicker(item.criterionIds || []);
      }),
      onDelete: async () => { await api("DELETE", `/api/rubrics/${item.id}`); await refreshAll(); },
    }));
  }
}

// ================= JUDGES =================
const judgesForm = $("#judges-form");
judgesForm.dataset.apiPath = "/api/judges";
const judgesEdit = wireEditableForm(judgesForm, {
  addLabel: "Adicionar juiz",
  onSubmit: (form) => ({
    label: form.label.value,
    agentValue: form.agentValue.value,
    modelId: form.modelId.value || undefined,
    promptTemplate: form.promptTemplate.value,
    defaultRubricIds: $$('input[name=defaultRubricIds]:checked', form).map((i) => i.value),
    notes: form.notes.value,
  }),
});

function renderJudgeModelSelect(selectedId = "") {
  const sel = $("#judge-model-select");
  const allowedValues = new Set(state.judgeModels.map((m) => m.value));
  // Normally only the curated high-tier models are offered. "Modo validação" widens it to every
  // registered model so the analyze pipeline can be smoke-tested with something cheap -- a judge
  // saved that way only works on analyze calls that also ask for validationMode, and its verdict
  // is stamped as not-a-real-evaluation.
  const validation = $("#judge-validation-mode") && $("#judge-validation-mode").checked;
  const options = validation ? state.models : state.models.filter((m) => allowedValues.has(m.value));
  sel.innerHTML = '<option value="">— nenhum —</option>' +
    options.map((m) => {
      const nonCurated = !allowedValues.has(m.value);
      const suffix = nonCurated ? " ⚠ fora da lista curada" : "";
      return `<option value="${escapeHtml(m.id)}" ${m.id === selectedId ? "selected" : ""}>${escapeHtml(m.label)} (${escapeHtml(m.value)})${suffix}</option>`;
    }).join("");
  $("#judge-model-values-hint").textContent = state.judgeModels.map((m) => m.value).join(", ");
}

function renderJudgeDefaultRubricPicker(checkedIds = []) {
  checkboxGroup($("#judge-default-rubrics"), state.rubrics, { name: "defaultRubricIds", checkedIds });
}
judgesForm.addEventListener("reset-extra", () => {
  $("#judge-validation-mode").checked = false;
  renderJudgeModelSelect();
  renderJudgeDefaultRubricPicker();
});

$("#judge-validation-mode").addEventListener("change", () => {
  renderJudgeModelSelect($("#judge-model-select").value);
});

function renderJudgesList() {
  const list = $("#judges-list");
  list.innerHTML = state.judges.length ? "" : '<p class="muted">Nothing registered yet.</p>';
  for (const item of state.judges) {
    const modelLabel = state.models.find((m) => m.id === item.modelId)?.label;
    const bits = [`agent: ${item.agentValue}`];
    bits.push(modelLabel ? `model: ${modelLabel}` : "model: (nenhum — não roda até cadastrar um)");
    if (item.promptTemplate && item.promptTemplate.trim()) bits.push("+instruções custom");
    const defaultNames = (item.defaultRubricIds || []).map((id) => state.rubrics.find((rubric) => rubric.id === id)?.label || id);
    if (defaultNames.length) bits.push(`conjuntos padrão: ${defaultNames.join(", ")}`);
    if (item.notes) bits.push(item.notes);
    list.appendChild(makeRow({
      title: item.label,
      sub: bits.join(" · "),
      onEdit: () => judgesEdit.startEdit(item.id, () => {
        judgesForm.label.value = item.label;
        judgesForm.agentValue.value = item.agentValue;
        judgesForm.promptTemplate.value = item.promptTemplate || "";
        judgesForm.notes.value = item.notes || "";
        // If the saved judge uses a validation-only model, widen the list before rebuilding it.
        // Rebuilding the curated list first used to silently clear the selected model on save.
        $("#judge-validation-mode").checked = judgeNeedsValidation(state.models, state.judgeModels, item.modelId);
        renderJudgeModelSelect(item.modelId || "");
        renderJudgeDefaultRubricPicker(item.defaultRubricIds || []);
      }),
      onDelete: async () => { await api("DELETE", `/api/judges/${item.id}`); await refreshAll(); },
    }));
  }
}

// ---------- judge pickers used across Compare / Analyze / Task editor ----------
function renderJudgePickers() {
  // Having rubrics but no judge is a dead end the UI used to just show as an empty dropdown --
  // say which single step is missing instead.
  const missing = $("#compare-judge-missing");
  if (missing) missing.hidden = !(state.rubrics.length > 0 && state.judges.length === 0);
  const opts = state.judges.map((j) => `<option value="${escapeHtml(j.id)}">${escapeHtml(j.label)}</option>`).join("");
  const placeholder = state.judges.length
    ? '<option value="">— nenhum —</option>'
    : '<option value="">— nenhum juiz cadastrado — abra Juízes —</option>';
  for (const id of ["compare-judge-picker", "analyze-judge-picker", "task-editor-judge-picker"]) {
    const sel = $(`#${id}`);
    if (sel) sel.innerHTML = placeholder + opts;
  }
  renderComparRubricPicker();
  renderTaskRubricPicker();
  renderStandaloneRubricPicker();
}

export function renderComparRubricPicker(checkedIds = []) {
  checkboxGroup($("#compare-rubric-picker"), state.rubrics, { name: "cmp-rubric", checkedIds });
}

export function renderTaskRubricPicker(checkedIds = []) {
  checkboxGroup($("#task-editor-rubric-picker"), state.rubrics, { name: "task-rubric", checkedIds });
}

export function renderStandaloneRubricPicker(checkedIds = []) {
  checkboxGroup($("#analyze-rubric-picker"), state.rubrics, { name: "standalone-rubric", checkedIds });
}

$("#compare-judge-picker").addEventListener("change", () => {
  renderComparRubricPicker(defaultCriterionSetIds(state.judges, $("#compare-judge-picker").value));
});
$("#task-editor-judge-picker").addEventListener("change", () => {
  renderTaskRubricPicker(defaultCriterionSetIds(state.judges, $("#task-editor-judge-picker").value));
});
$("#analyze-judge-picker").addEventListener("change", () => {
  renderStandaloneRubricPicker(defaultCriterionSetIds(state.judges, $("#analyze-judge-picker").value));
});


// Registered with the refresh cycle instead of being called by name from state.js --
// see the note at the top of state.js.
onRefresh(() => { renderCriteriaList(); renderRubricsList(); renderJudgesList(); renderRubricCriterionPicker(); renderJudgeModelSelect(); renderJudgeDefaultRubricPicker(); renderJudgePickers(); });
