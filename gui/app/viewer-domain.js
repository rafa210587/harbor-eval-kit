const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function safeLocalViewerUrl(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" || !LOOPBACK_HOSTS.has(parsed.hostname)) return null;
    return parsed.href;
  } catch { return null; }
}

export function viewerStatusText(viewer, elapsedSeconds = 0) {
  if (viewer?.status === "running" && safeLocalViewerUrl(viewer.url)) return "Visualizador pronto.";
  if (viewer?.status === "failed") return `O visualizador falhou${viewer.error ? `: ${viewer.error}` : "."}`;
  if (viewer?.status === "succeeded") return "Visualizador encerrado.";
  return `Harbor está preparando o visualizador há ${elapsedSeconds}s; a URL local ainda não está pronta.`;
}
