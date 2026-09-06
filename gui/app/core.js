// DOM helpers, the API client, tab switching and the generic form kit every registry tab
// reuses. No domain knowledge lives here -- if something knows what a "judge" is, it
// belongs in a feature module, not in core.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error((data && data.error) || res.statusText);
  return data;
}

// ---------- tabs ----------
// Feature modules register a refresher by tab id; core does not know which tabs exist.
export const tabRefreshers = {};
const tabSwitchHooks = [];
$$("#tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$("#tabs button").forEach((b) => b.classList.remove("active"));
    $$(".tab").forEach((s) => s.classList.remove("active"));
    btn.classList.add("active");
    $("#tab-" + btn.dataset.tab).classList.add("active");
    for (const hook of tabSwitchHooks) hook(btn.dataset.tab);
    const fn = tabRefreshers[btn.dataset.tab];
    if (fn) fn();
  });
});


// Extra work some tab needs on every switch (e.g. starting\/stopping log polling).
export function onTabSwitch(fn) { tabSwitchHooks.push(fn); }

// ---------- .md attach helper ----------
$$('input[type=file][data-attach-target]').forEach((input) => {
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    const text = await file.text();
    const form = document.getElementById(input.dataset.attachTarget);
    const textarea = form.querySelector('textarea[name=instructions]');
    if (textarea) textarea.value = text;
    input.value = "";
  });
});


export function makeRow(item, { title, sub, onEdit, onDelete }) {
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `<div class="row-main"><div class="row-title">${escapeHtml(title)}</div>${sub ? `<div class="row-sub">${sub}</div>` : ""}</div><div class="row-actions"></div>`;
  const actions = row.querySelector(".row-actions");
  const editBtn = document.createElement("button");
  editBtn.textContent = "Edit";
  editBtn.onclick = onEdit;
  actions.appendChild(editBtn);
  const delBtn = document.createElement("button");
  delBtn.textContent = "Remove";
  delBtn.className = "danger";
  delBtn.onclick = onDelete;
  actions.appendChild(delBtn);
  return row;
}

export function checkboxGroup(container, items, { name, checkedIds = [] }) {
  container.innerHTML = items.length ? "" : '<span class="muted">nada cadastrado ainda</span>';
  for (const item of items) {
    const label = document.createElement("label");
    const checked = checkedIds.includes(item.id) ? "checked" : "";
    label.innerHTML = `<input type="checkbox" name="${name}" value="${item.id}" ${checked}> ${escapeHtml(item.label)}`;
    container.appendChild(label);
  }
}

