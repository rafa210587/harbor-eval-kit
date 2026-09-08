// DOM helpers, the API client, tab switching and the generic form kit every registry tab
// reuses. No domain knowledge lives here -- if something knows what a "judge" is, it
// belongs in a feature module, not in core.
import { mergeHelpIds } from "./field-help.js";

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

// ---------- compact mode ----------
// Hides the ~2,600 words of first-time-user .hint text once someone doesn't need it anymore.
// Per-browser preference (localStorage), not sent to the server -- same "convenience for this
// viewer" precedent as everything else this kit keeps client-side.
try {
  const compactToggle = document.getElementById("compact-toggle");
  const saved = localStorage.getItem("hek-compact-mode") === "1";
  document.body.classList.toggle("compact", saved);
  compactToggle.checked = saved;
  compactToggle.addEventListener("change", () => {
    document.body.classList.toggle("compact", compactToggle.checked);
    try { localStorage.setItem("hek-compact-mode", compactToggle.checked ? "1" : "0"); } catch { /* private mode etc. -- just don't persist */ }
  });
} catch { /* localStorage inaccessible (private browsing, blocked) -- compact mode simply stays off */ }

// ---------- tabs ----------
// Feature modules register a refresher by tab id; core does not know which tabs exist.
export const tabRefreshers = {};
const tabSwitchHooks = [];
export function activateTab(tab) {
  const btn = $(`#tabs button[data-tab="${tab}"]`);
  const section = $(`#tab-${tab}`);
  if (!btn || !section) return;
  $$("#tabs button").forEach((b) => b.classList.toggle("active", b === btn));
  $$(".tab").forEach((s) => s.classList.toggle("active", s === section));
  for (const hook of tabSwitchHooks) hook(tab);
  const fn = tabRefreshers[tab];
  if (fn) fn();
}
$$("#tabs button").forEach((btn) => {
  btn.addEventListener("click", () => activateTab(btn.dataset.tab));
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


// `sub` is escaped HERE, not by the callers. It used to be interpolated raw, and the callers
// escaped only some of what they concatenated into it -- an agent's free-text `--agent value`,
// a criterion name and a skill label all reached the DOM unescaped, while `notes` next to them
// was escaped. Escaping at the sink is the only version of this that cannot rot: a new caller
// gets it right by default instead of having to remember. Matters beyond self-XSS because a
// config bundle is meant to be shared and imported, and this page can reach the whole local API.
export function makeRow(item, { title, sub, onEdit, onDelete }) {
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `<div class="row-main"><div class="row-title">${escapeHtml(title)}</div>${sub ? `<div class="row-sub">${escapeHtml(sub)}</div>` : ""}</div><div class="row-actions"></div>`;
  const actions = row.querySelector(".row-actions");
  const editBtn = document.createElement("button");
  editBtn.textContent = "Editar";
  editBtn.onclick = onEdit;
  actions.appendChild(editBtn);
  const delBtn = document.createElement("button");
  delBtn.textContent = "Remover";
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
    // item.id is escaped too: ids are server-generated UUIDs for locally created entries, but
    // an imported config bundle carries whatever ids the file says, and this one lands inside
    // an HTML attribute where a bare quote would break out of it.
    label.innerHTML = `<input type="checkbox" name="${escapeHtml(name)}" value="${escapeHtml(item.id)}" ${checked}> ${escapeHtml(item.label)}`;
    const input = label.querySelector("input");
    const describedBy = mergeHelpIds(input.getAttribute("aria-describedby"), container.getAttribute("aria-describedby"));
    if (describedBy) input.setAttribute("aria-describedby", describedBy);
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
