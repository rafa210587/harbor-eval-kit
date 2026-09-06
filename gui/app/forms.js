// Edit-in-place form wiring. Lives above core.js on purpose: saving a registry entry has to
// trigger a refresh, and core.js must not know the refresh cycle exists -- that would make
// core depend on state, which depends on core. This module is the layer that knows both.

import { api } from "./core.js";
import { refreshAll } from "./state.js";

export function wireEditableForm(formEl, { onSubmit, addLabel = "Add" }) {
  const submitBtn = formEl.querySelector('button[type=submit]');
  const cancelBtn = formEl.querySelector('.cancel-edit');
  let editingId = null;

  function startEdit(id, populate) {
    editingId = id;
    populate();
    submitBtn.textContent = "Save changes";
    if (cancelBtn) cancelBtn.hidden = false;
  }
  function cancelEdit() {
    editingId = null;
    formEl.reset();
    submitBtn.textContent = addLabel;
    if (cancelBtn) cancelBtn.hidden = true;
    formEl.dispatchEvent(new Event("reset-extra"));
  }
  if (cancelBtn) cancelBtn.addEventListener("click", (e) => { e.preventDefault(); cancelEdit(); });

  formEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = onSubmit(formEl);
    try {
      if (editingId) await api("PUT", `${formEl.dataset.apiPath}/${editingId}`, data);
      else await api("POST", formEl.dataset.apiPath, data);
      cancelEdit();
      await refreshAll();
    } catch (err) { alert(err.message); }
  });

  return { startEdit, cancelEdit };
}
