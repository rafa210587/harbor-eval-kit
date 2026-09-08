// Pure provider discovery helpers. Keeping these separate makes the UI flow testable
// without a browser and keeps response/registration handling consistent.

/**
 * Turn provider catalog values into canonical provider/model values.
 * Empty and non-string entries are ignored; duplicates are removed only after
 * the provider prefix has been applied, since `model` and `provider/model`
 * describe the same catalog item.
 */
export function normalizeDiscoveredModels(raw, providerId = "") {
  if (!Array.isArray(raw)) return [];
  const prefix = String(providerId || "").trim();
  const values = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const value = item.trim();
    if (!value) continue;
    const canonical = value.includes("/") || !prefix ? value : `${prefix}/${value}`;
    const slash = canonical.indexOf("/");
    if (slash >= 0 && (!canonical.slice(0, slash).trim() || !canonical.slice(slash + 1).trim())) continue;
    if (!values.includes(canonical)) values.push(canonical);
  }
  return values;
}

/**
 * Register selected models while exposing every state transition to the UI.
 * The callbacks are deliberately small so this contract can be exercised
 * without DOM or network access.
 */
export async function registerDiscoveredModels(values, { api: request, refreshAll: refreshRegistry, setLocked, setStatus }) {
  const selected = Array.isArray(values)
    ? [...new Set(values.filter((value) => typeof value === "string").map((value) => value.trim()).filter(Boolean))]
    : [];
  if (!selected.length) {
    setStatus?.("Nenhum modelo novo foi marcado para cadastrar.");
    return 0;
  }
  setLocked?.(true);
  setStatus?.(`Cadastrando ${selected.length} modelo(s)…`);
  try {
    for (const value of selected) {
      const response = await request("POST", "/api/models", { label: value, value });
      if (response?.ok === false) throw new Error(response.error || "o servidor recusou o modelo");
    }
    await refreshRegistry();
    setStatus?.(`${selected.length} modelo(s) cadastrado(s).`);
    return selected.length;
  } catch (error) {
    setStatus?.(`Erro ao cadastrar modelos: ${error?.message || error}`);
    return 0;
  } finally {
    setLocked?.(false);
  }
}
