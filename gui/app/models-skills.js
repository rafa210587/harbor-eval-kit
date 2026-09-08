// Models, Skills and Skill Sets: three registries that share the same CRUD shape.
import { $, $$, api, escapeHtml, makeRow, checkboxGroup } from "./core.js";
import { wireEditableForm } from "./forms.js";
import { state, onRefresh, refreshAll, keyStatusBadge, guessProviderKey } from "./state.js";

// ================= MODELS =================
const modelsForm = $("#models-form");
modelsForm.dataset.apiPath = "/api/models";
const modelsEdit = wireEditableForm(modelsForm, {
  addLabel: "Adicionar modelo",
  onSubmit: (form) => ({ label: form.label.value, value: form.value.value }),
});

function renderModelsList() {
  const list = $("#models-list");
  list.innerHTML = state.models.length ? "" : '<p class="muted">Nothing registered yet.</p>';
  for (const item of state.models) {
    const row = makeRow({
      title: `${item.label} (${item.value})`,
      onEdit: () => modelsEdit.startEdit(item.id, () => {
        modelsForm.label.value = item.label;
        modelsForm.value.value = item.value;
        updateModelKeyPreview();
      }),
      onDelete: async () => { await api("DELETE", `/api/models/${item.id}`); await refreshAll(); },
    });
    list.appendChild(row);
    row.querySelector(".row-title").innerHTML = `${escapeHtml(item.label)} (${escapeHtml(item.value)}) ${keyStatusBadge(item.value)}`;
  }
}
function updateModelKeyPreview() {
  const v = modelsForm.value.value;
  const key = guessProviderKey(v);
  $("#model-key-preview").innerHTML = key
    ? `Vai esperar a key <code>${escapeHtml(key)}</code> — ${keyStatusBadge(v)}`
    : "";
}
modelsForm.value.addEventListener("input", updateModelKeyPreview);
modelsForm.addEventListener("reset-extra", updateModelKeyPreview);

// ================= SKILLS =================
const skillsForm = $("#skills-form");
skillsForm.dataset.apiPath = "/api/skills";
function setSkillMode(mode) {
  skillsForm.querySelector('[data-mode-section=authored]').hidden = mode !== "authored";
  skillsForm.querySelector('[data-mode-section=path]').hidden = mode !== "path";
}
$$('input[name=mode]', skillsForm).forEach((r) => r.addEventListener("change", () => setSkillMode(r.value)));
skillsForm.addEventListener("reset-extra", () => { setSkillMode("authored"); skillExtraFiles = []; renderSkillExtraFiles(); });

// In-memory {name, content} list for the currently-open Skills form -- submitted as
// `extraFiles`, materialized alongside SKILL.md (see materializeSkillMd in lib/harbor.ts).
let skillExtraFiles = [];

function renderSkillExtraFiles() {
  const container = $("#skill-extra-files-list");
  container.innerHTML = "";
  skillExtraFiles.forEach((f, idx) => {
    const row = document.createElement("div");
    row.className = "panel";
    const nameId = `skill-extra-name-${idx}`;
    const nameHelpId = `${nameId}-help`;
    const contentId = `skill-extra-content-${idx}`;
    const contentHelpId = `${contentId}-help`;
    row.innerHTML = `
      <div class="row-inline">
        <div><label for="${nameId}">Caminho relativo</label><input id="${nameId}" type="text" class="extra-file-name" placeholder="examples/bom.py" value="${escapeHtml(f.name)}" aria-describedby="${nameHelpId}"><p id="${nameHelpId}" class="hint">Finalidade: nome e subpasta do arquivo dentro da skill. Exemplo: examples/bom.py. Padrão: vazio; opcional, linhas sem nome não são salvas.</p></div>
      </div>
      <label for="${contentId}">Conteúdo</label>
      <textarea id="${contentId}" class="extra-file-content" aria-describedby="${contentHelpId}" style="min-height:90px;">${escapeHtml(f.content)}</textarea>
      <p id="${contentHelpId}" class="hint">Finalidade: conteúdo entregue ao agente junto com a skill. Exemplo: código, template ou referência. Padrão: vazio; opcional.</p>
      <button type="button" class="secondary" style="margin-top:6px;">Remover este arquivo</button>
    `;
    row.querySelector(".extra-file-name").addEventListener("input", (e) => { skillExtraFiles[idx].name = e.target.value; });
    row.querySelector(".extra-file-content").addEventListener("input", (e) => { skillExtraFiles[idx].content = e.target.value; });
    row.querySelector("button").addEventListener("click", () => { skillExtraFiles.splice(idx, 1); renderSkillExtraFiles(); });
    container.appendChild(row);
  });
}

$("#skill-extra-file-input").addEventListener("change", async (e) => {
  for (const file of e.target.files) {
    skillExtraFiles.push({ name: file.name, content: await file.text() });
  }
  e.target.value = "";
  renderSkillExtraFiles();
});
$("#skill-add-blank-file-btn").addEventListener("click", () => {
  skillExtraFiles.push({ name: "", content: "" });
  renderSkillExtraFiles();
});

const skillsEdit = wireEditableForm(skillsForm, {
  addLabel: "Adicionar skill",
  onSubmit: (form) => ({
    label: form.label.value,
    mode: form.mode.value,
    instructions: form.instructions.value,
    path: form.path.value,
    extraFiles: skillExtraFiles.filter((f) => f.name.trim()),
  }),
});

function renderSkillsList() {
  const list = $("#skills-list");
  list.innerHTML = state.skills.length ? "" : '<p class="muted">Nothing registered yet.</p>';
  for (const item of state.skills) {
    // Plain text on both: makeRow escapes title and sub itself now. The badge markup is added
    // by the .row-title overwrite below, which escapes each field it interpolates.
    const sub = item.mode === "path"
      ? `path: ${item.path || ""}`
      : (item.instructions || "").slice(0, 100) + ((item.instructions || "").length > 100 ? "…" : "")
        + (item.extraFiles && item.extraFiles.length ? ` · +${item.extraFiles.length} arquivo(s) extra` : "");
    list.appendChild(makeRow({
      title: item.label,
      sub,
      onEdit: () => skillsEdit.startEdit(item.id, () => {
        skillsForm.label.value = item.label;
        skillsForm.querySelector(`input[name=mode][value="${item.mode}"]`).checked = true;
        skillsForm.instructions.value = item.instructions || "";
        skillsForm.path.value = item.path || "";
        skillExtraFiles = (item.extraFiles || []).map((f) => ({ ...f }));
        renderSkillExtraFiles();
        setSkillMode(item.mode);
      }),
      onDelete: async () => { await api("DELETE", `/api/skills/${item.id}`); await refreshAll(); },
    }));
    list.lastChild.querySelector(".row-title").innerHTML = `${escapeHtml(item.label)} <span class="badge">${escapeHtml(item.mode)}</span>`;
  }
}

// ================= SKILL SETS =================
const skillsetsForm = $("#skillsets-form");
skillsetsForm.dataset.apiPath = "/api/skillsets";
const skillsetsEdit = wireEditableForm(skillsetsForm, {
  addLabel: "Adicionar conjunto",
  onSubmit: (form) => ({
    label: form.label.value,
    skillIds: $$('input[name=skillIds]:checked', form).map((i) => i.value),
  }),
});

function renderSkillsetSkillPicker(checkedIds = []) {
  checkboxGroup($("#skillset-skill-picker"), state.skills, { name: "skillIds", checkedIds });
}
skillsetsForm.addEventListener("reset-extra", () => renderSkillsetSkillPicker());

function renderSkillsetsList() {
  const list = $("#skillsets-list");
  list.innerHTML = state.skillsets.length ? "" : '<p class="muted">Nothing registered yet.</p>';
  for (const item of state.skillsets) {
    const names = (item.skillIds || []).map((id) => state.skills.find((s) => s.id === id)?.label || "?").join(", ");
    list.appendChild(makeRow({
      title: item.label,
      sub: names || "(sem skills)",
      onEdit: () => skillsetsEdit.startEdit(item.id, () => {
        skillsetsForm.label.value = item.label;
        renderSkillsetSkillPicker(item.skillIds || []);
      }),
      onDelete: async () => { await api("DELETE", `/api/skillsets/${item.id}`); await refreshAll(); },
    }));
  }
}


// Registered with the refresh cycle instead of being called by name from state.js --
// see the note at the top of state.js.
onRefresh(() => { renderModelsList(); renderSkillsList(); renderSkillsetsList(); renderSkillsetSkillPicker(); });
