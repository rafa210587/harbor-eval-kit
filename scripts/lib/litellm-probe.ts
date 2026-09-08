// Host-side proxy probes. Never return upstream text: error bodies and model
// metadata can contain credentials. Only explicitly selected inference spends tokens.
import { validateLitellmGatewayConfig, type LitellmGatewayConfig } from "./litellm.ts";

const MODEL = /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,199}$/;

export function litellmProbeStatus(cfg: LitellmGatewayConfig, secrets: Record<string, string>) {
  return { enabled: cfg.enabled, configured: Boolean(cfg.enabled && cfg.hostBaseUrl),
    inferenceKeyEnv: cfg.inferenceKeyEnv ?? "LITELLM_INFERENCE_KEY",
    hasCredential: Boolean(cfg.inferenceKeyEnv && secrets[cfg.inferenceKeyEnv]?.trim()) };
}

function connection(cfg: LitellmGatewayConfig, secrets: Record<string, string>) {
  if (!cfg.enabled) throw new Error("Gateway LiteLLM desligado. Configure litellm-gateway.json antes de consultar o proxy.");
  const valid = validateLitellmGatewayConfig(cfg);
  if (!valid.hostBaseUrl) throw new Error("Configure hostBaseUrl para consultar o LiteLLM a partir da UI no host.");
  const key = secrets[valid.inferenceKeyEnv!];
  if (!key?.trim()) throw new Error("Salve a chave de inferência do LiteLLM na aba Credenciais.");
  const base = valid.hostBaseUrl.replace(/\/+$/, "");
  return { base: base.endsWith("/v1") ? base : `${base}/v1`, key };
}

async function requestJson(cfg: LitellmGatewayConfig, secrets: Record<string, string>, path: string, body: unknown, request: typeof fetch) {
  const { base, key } = connection(cfg, secrets);
  let response: Response;
  try {
    response = await request(`${base}/${path}`, {
      method: body === undefined ? "GET" : "POST", redirect: "error",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
  } catch { throw new Error("Não foi possível acessar LiteLLM: verifique hostBaseUrl, rede/TLS e timeout (15s). Redirects não são permitidos."); }
  if (!response.ok) {
    try { await response.body?.cancel(); } catch { /* Never surface transport diagnostics. */ }
    const hint = response.status === 401 || response.status === 403 ? " Verifique a chave de inferência e suas permissões." : " Verifique o endpoint e a disponibilidade do proxy.";
    throw new Error(`LiteLLM respondeu HTTP ${response.status}.${hint}`);
  }
  // Bound streamed output as well as declared length; never retain an arbitrary body.
  try {
    const reader = response.body?.getReader();
    if (!reader) throw new Error();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 1024 * 1024) throw new Error();
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { throw new Error("Resposta JSON inválida ou excessiva do LiteLLM."); }
}

export async function discoverLitellmModels(cfg: LitellmGatewayConfig, secrets: Record<string, string>, request: typeof fetch = fetch): Promise<{ models: string[] }> {
  const data = await requestJson(cfg, secrets, "models", undefined, request);
  if (!data || !Array.isArray(data.data) || data.data.some((item: any) => !item || typeof item.id !== "string" || !MODEL.test(item.id))) {
    throw new Error("Catálogo LiteLLM inválido: esperado data com identificadores de modelos.");
  }
  const sensitive = Object.values(secrets).filter(Boolean);
  const models: string[] = [...new Set<string>(data.data.map((item: any) => item.id))];
  if (models.some(id => sensitive.some(secret => id.includes(secret)))) throw new Error("Catálogo LiteLLM contém conteúdo sensível; resposta bloqueada.");
  return { models };
}

export async function testLitellmModel(model: unknown, cfg: LitellmGatewayConfig, secrets: Record<string, string>, request: typeof fetch = fetch): Promise<{ ok: true; testedModel: string }> {
  if (typeof model !== "string" || !MODEL.test(model)) throw new Error("Escolha explicitamente um alias de modelo válido antes do teste pago.");
  if (Object.values(secrets).filter(Boolean).some(secret => model.includes(secret))) throw new Error("Identificador de modelo contém conteúdo sensível.");
  const data = await requestJson(cfg, secrets, "chat/completions", { model, messages: [{ role: "user", content: "Reply OK." }], max_tokens: 8, stream: false }, request);
  if (!Array.isArray(data?.choices) || !data.choices.some((choice: any) => typeof choice?.message?.content === "string" && choice.message.content.trim())) {
    throw new Error("LiteLLM não retornou uma resposta de chat válida para o modelo escolhido.");
  }
  return { ok: true, testedModel: model };
}
