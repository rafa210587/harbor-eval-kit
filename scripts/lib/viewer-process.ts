/** Accept only the loopback URL printed by Harbor's local viewer. */
export function viewerUrlFromOutput(text: string): string | null {
  const candidates = text.match(/https?:\/\/[^\s\x1b]+/gi) ?? [];
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      if (!["http:", "https:"].includes(url.protocol)) continue;
      if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) continue;
      const port = Number(url.port);
      if (!Number.isInteger(port) || port < 1 || port > 65535) continue;
      return url.href;
    } catch { /* keep scanning trusted process output */ }
  }
  return null;
}
