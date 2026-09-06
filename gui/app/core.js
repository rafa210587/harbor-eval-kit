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

// Above this many items, a checkbox group grows a filter box instead of just getting longer.
// Judge Rubrics' criterion picker, a Skill Set's skill picker and the rest all share this one
// function, so fixing "gets cluttered with many items" here fixes it everywhere at once rather
// than one tab at a time.
const CHECKBOX_FILTER_THRESHOLD = 8;

export function checkboxGroup(container, items, { name, checkedIds = [] }) {
  container.innerHTML = "";
  if (items.length === 0) {
    container.innerHTML = '<span class="muted">nada cadastrado ainda</span>';
    return;
  }

  const labels = items.map((item) => {
    const label = document.createElement("label");
    const checked = checkedIds.includes(item.id) ? "checked" : "";
    label.innerHTML = `<input type="checkbox" name="${name}" value="${item.id}" ${checked}> ${escapeHtml(item.label)}`;
    label.dataset.searchText = item.label.toLowerCase();
    return label;
  });

  if (items.length > CHECKBOX_FILTER_THRESHOLD) {
    const filter = document.createElement("input");
    filter.type = "search";
    filter.className = "checkbox-group-filter";
    filter.placeholder = `Filtrar entre ${items.length}…`;
    // Hiding rather than removing keeps a checked-but-filtered-out item checked underneath --
    // clearing the filter brings it back exactly as it was, selection intact.
    filter.addEventListener("input", () => {
      const q = filter.value.trim().toLowerCase();
      for (const label of labels) label.hidden = q !== "" && !label.dataset.searchText.includes(q);
    });
    container.appendChild(filter);
  }
  for (const label of labels) container.appendChild(label);
}

