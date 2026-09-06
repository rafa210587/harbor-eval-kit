// Config Bundle tab: export every registry to a downloadable file, and import one back in.
// See scripts/lib/bundle.ts for why this exists and the idempotent-upsert-by-id semantics.
import { $, api } from "./core.js";
import { refreshAll } from "./state.js";

$("#config-export-btn").addEventListener("click", async () => {
  const status = $("#config-bundle-status");
  try {
    const bundle = await api("GET", "/api/config/export");
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `harbor-eval-kit-config-${bundle.exportedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    const counts = Object.entries(bundle.registries).map(([k, v]) => `${k}: ${v.length}`).join(", ");
    status.textContent = `Exportado. ${counts}`;
    status.style.color = "var(--ok)";
  } catch (err) {
    status.textContent = "Erro ao exportar: " + err.message;
    status.style.color = "var(--err)";
  }
});

$("#config-import-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const status = $("#config-bundle-status");
  status.textContent = "Importando…";
  status.style.color = "";
  try {
    const text = await file.text();
    const bundle = JSON.parse(text);
    const summary = await api("POST", "/api/config/import", bundle);
    const breakdown = Object.entries(summary.byRegistry)
      .map(([k, v]) => `${k}: +${v.added}/~${v.updated}`)
      .join(", ");
    status.textContent =
      `Importado -- ${summary.added} novo(s), ${summary.updated} atualizado(s). ${breakdown}` +
      (summary.warnings.length ? ` — avisos: ${summary.warnings.join("; ")}` : "");
    status.style.color = summary.warnings.length ? "var(--warn)" : "var(--ok)";
    await refreshAll();
  } catch (err) {
    status.textContent = "Erro ao importar: " + err.message;
    status.style.color = "var(--err)";
  } finally {
    e.target.value = "";
  }
});
