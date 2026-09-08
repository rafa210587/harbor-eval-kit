// Proxy aliases are opaque: even "anthropic/sonnet" needs the openai transport prefix.
export function gatewayModelChoices(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((alias) => typeof alias === "string" && alias.trim()))]
    .map((alias) => ({ alias, value: `openai/${alias}` }));
}
