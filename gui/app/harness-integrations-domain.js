export function harnessAuthFields(adapter, mode) {
  return { api: mode === "api", authFile: mode === "native" && adapter === "codex", oauth: mode === "native" && adapter === "claude-code" };
}

export function catalogEntries(payload) {
  const rows = Array.isArray(payload) ? payload : payload?.adapters || payload?.catalog || [];
  return rows.filter((item) => item && typeof item.adapter === "string").map((item) => ({
    adapter: item.adapter, label: item.label || item.adapter, authModes: ["api", ...(item.native === true ? ["native"] : [])],
    supported: item.supported !== false, versionPin: item.versionPin === true, modelDiscovery: item.discovery === true,
    executable: item.executable || "", protocol: item.protocol || "", blockers: Array.isArray(item.blockers) ? item.blockers : [],
  }));
}

export function integrationRequest(draft, catalog = []) {
  const adapter = String(draft.adapter || "").trim(), authMode = draft.authMode;
  const entry = catalog.find((item) => item.adapter === adapter);
  if (!String(draft.label || "").trim()) throw new Error("Dê um nome à integração.");
  if (!entry) throw new Error("Escolha um adapter informado pelo catálogo do servidor.");
  if (!entry.supported) throw new Error(entry.blockers.join(" ") || "Este adapter ainda está bloqueado.");
  if (!["api", "native"].includes(authMode)) throw new Error("Escolha autenticação por API ou login nativo.");
  if (!entry.authModes.includes(authMode)) throw new Error(`Modo ${authMode} ainda não é suportado por ${entry.label}.`);
  if (draft.trustedRepository !== true) throw new Error("Confirme o uso somente com repositórios confiáveis.");
  const request = { label: String(draft.label).trim(), adapter, authMode, trustedRepository: true };
  for (const key of ["version", "credentialEnv", "baseUrl", "authFilePath"]) { const value = String(draft[key] || "").trim(); if (value) request[key] = value; }
  if (authMode === "api") delete request.authFilePath;
  else { delete request.baseUrl; if (adapter === "codex") delete request.credentialEnv; else delete request.authFilePath; }
  return request;
}

export function integrationSummary(item) {
  const auth = item.authMode === "native" ? ((item.hasAuthFile || item.credentialEnv) ? "login nativo vinculado" : "login nativo ainda não vinculado") : (item.credentialEnv ? `API via ${item.credentialEnv}` : "variável de API não informada");
  return `${item.adapter}${item.version ? ` ${item.version}` : ""} · ${auth}`;
}

export function discoveredModelIds(payload) {
  const rows = Array.isArray(payload) ? payload : payload?.models || [];
  return [...new Set(rows.map((item) => typeof item === "string" ? item : item?.id).filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()))];
}
