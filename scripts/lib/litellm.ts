// LiteLLM proxy seam. The SDK used by the Secrets test is a separate, direct integration.
// This file only prepares optional proxy environment variables; the proxy remains OFF by default.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getStateDir } from "./paths.ts";

export interface LitellmGatewayConfig {
  enabled: boolean;
  hostBaseUrl?: string | null;
  containerBaseUrl?: string | null;
  /** Name of the env var containing the credential accepted by the proxy inference endpoint. */
  inferenceKeyEnv?: string | null;
  /** Name used by the proxy process itself; it is never sent to Harbor agents. */
  masterKeyEnv?: string | null;
  env: Record<string, string>;
}

export const LITELLM_GATEWAY_DISABLED: LitellmGatewayConfig = {
  enabled: false,
  hostBaseUrl: null,
  containerBaseUrl: null,
  inferenceKeyEnv: null,
  masterKeyEnv: null,
  env: {},
};

const CONFIG_KEYS = new Set(["_comment", "enabled", "hostBaseUrl", "containerBaseUrl", "inferenceKeyEnv", "masterKeyEnv", "env"]);
const PLACEHOLDERS = new Set(["hostBaseUrl", "containerBaseUrl", "inferenceKey"]);
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const INFRA_NAMES = new Set(["DOCKER_HOST", "PATH", "HOME", "PWD", "PYTHONIOENCODING"]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`configuração LiteLLM inválida: ${label} deve ser um objeto`);
  return value as Record<string, unknown>;
}

function optionalText(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !value.trim()) throw new Error(`configuração LiteLLM inválida: ${label} deve ser texto não vazio ou nulo`);
  return value.trim();
}

function endpoint(value: string | null, label: string): string | null {
  if (value === null) return null;
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error(`configuração LiteLLM inválida: ${label} não é uma URL`); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) throw new Error(`configuração LiteLLM inválida: ${label} deve ser uma URL HTTP(S) sem credenciais`);
  return value;
}

function envName(value: unknown, label: string): string | null {
  const text = optionalText(value, label);
  if (text !== null && !ENV_NAME.test(text)) throw new Error(`configuração LiteLLM inválida: ${label} não é um nome de variável de ambiente`);
  return text;
}

function validateTemplates(value: unknown, host: string | null, container: string | null, inference: string | null): Record<string, string> {
  const input = record(value, "env");
  const output: Record<string, string> = {};
  for (const [name, raw] of Object.entries(input)) {
    if (!ENV_NAME.test(name)) throw new Error(`configuração LiteLLM inválida: env contém nome inválido '${name}'`);
    if (INFRA_NAMES.has(name) || name.startsWith("HARBOR_")) throw new Error(`configuração LiteLLM inválida: env.${name} é variável de infraestrutura`);
    if (typeof raw !== "string" || !raw.trim()) throw new Error(`configuração LiteLLM inválida: env.${name} deve ser texto não vazio`);
    const placeholders = [...raw.matchAll(/\{([^{}]+)\}/g)].map(match => match[1]);
    if (/[{}]/.test(raw.replace(/\{[^{}]+\}/g, ""))) throw new Error(`configuração LiteLLM inválida: chaves de placeholder não fechadas em env.${name}`);
    for (const placeholder of placeholders) {
      if (!PLACEHOLDERS.has(placeholder)) throw new Error(`configuração LiteLLM inválida: placeholder desconhecido em env.${name}`);
      if (placeholder === "hostBaseUrl" && host === null) throw new Error(`configuração LiteLLM inválida: env.${name} usa hostBaseUrl ausente`);
      if (placeholder === "containerBaseUrl" && container === null) throw new Error(`configuração LiteLLM inválida: env.${name} usa containerBaseUrl ausente`);
      if (placeholder === "inferenceKey" && inference === null) throw new Error(`configuração LiteLLM inválida: env.${name} usa inferenceKey sem inferenceKeyEnv`);
    }
    // Sensitive values must come from the inference credential, never the proxy master key.
    if (/(key|secret|token|password|credential)/i.test(name) && !placeholders.includes("inferenceKey")) throw new Error(`configuração LiteLLM inválida: env.${name} precisa usar {inferenceKey}`);
    if (/[A-Za-z0-9_-]{24,}/.test(raw.replace(/\{[^{}]+\}/g, ""))) throw new Error(`configuração LiteLLM inválida: env.${name} contém valor literal que pode ser uma credencial`);
    output[name] = raw;
  }
  return output;
}

/** Validates the on-disk schema and returns a normalized config. */
export function validateLitellmGatewayConfig(value: unknown): LitellmGatewayConfig {
  const input = record(value, "raiz");
  for (const key of Object.keys(input)) if (!CONFIG_KEYS.has(key)) throw new Error(`configuração LiteLLM inválida: campo desconhecido '${key}'`);
  if (input._comment !== undefined && (!Array.isArray(input._comment) || input._comment.some(item => typeof item !== "string"))) throw new Error("configuração LiteLLM inválida: _comment deve ser uma lista de textos");
  if (input.enabled !== true) throw new Error("configuração LiteLLM inválida: enabled deve ser true para validar uma configuração ligada");
  const hostBaseUrl = endpoint(optionalText(input.hostBaseUrl, "hostBaseUrl"), "hostBaseUrl");
  const containerBaseUrl = endpoint(optionalText(input.containerBaseUrl, "containerBaseUrl"), "containerBaseUrl");
  if (hostBaseUrl === null && containerBaseUrl === null) throw new Error("configuração LiteLLM inválida: informe hostBaseUrl ou containerBaseUrl");
  const inferenceKeyEnv = envName(input.inferenceKeyEnv, "inferenceKeyEnv");
  if (inferenceKeyEnv === null) throw new Error("configuração LiteLLM inválida: inferenceKeyEnv é obrigatório quando o proxy está ligado");
  const masterKeyEnv = envName(input.masterKeyEnv, "masterKeyEnv");
  if (masterKeyEnv !== null && masterKeyEnv === inferenceKeyEnv) throw new Error("configuração LiteLLM inválida: masterKeyEnv e inferenceKeyEnv devem ser diferentes");
  const env = validateTemplates(input.env, hostBaseUrl, containerBaseUrl, inferenceKeyEnv);
  if (Object.keys(env).length === 0) throw new Error("configuração LiteLLM inválida: env não pode ser vazio quando o proxy está ligado");
  if (masterKeyEnv !== null && Object.prototype.hasOwnProperty.call(env, masterKeyEnv)) throw new Error("configuração LiteLLM inválida: masterKeyEnv não pode ser mapeada para o ambiente do agente");
  return { enabled: true, hostBaseUrl, containerBaseUrl, inferenceKeyEnv, masterKeyEnv, env };
}

export function getLitellmGatewayPath(): string {
  return join(getStateDir(), "litellm-gateway.json");
}

/** Absent or explicitly OFF is a no-op. Existing malformed or enabled-invalid files fail loud. */
export function getLitellmGatewayConfig(): LitellmGatewayConfig {
  const path = getLitellmGatewayPath();
  if (!existsSync(path)) return LITELLM_GATEWAY_DISABLED;
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(path, "utf-8")); }
  catch { throw new Error(`configuração LiteLLM inválida em ${path}: não foi possível ler JSON válido`); }
  const input = record(parsed, "raiz");
  if (input.enabled === undefined || input.enabled === false) return LITELLM_GATEWAY_DISABLED;
  return validateLitellmGatewayConfig(input);
}

/** Resolves an enabled config with the same validation for files and in-memory callers. */
export function litellmGatewayEnv(cfg: LitellmGatewayConfig = getLitellmGatewayConfig(), secrets: Record<string, string> = {}): Record<string, string> {
  if (!cfg.enabled) return {};
  const validated = validateLitellmGatewayConfig({ enabled: cfg.enabled, hostBaseUrl: cfg.hostBaseUrl, containerBaseUrl: cfg.containerBaseUrl, inferenceKeyEnv: cfg.inferenceKeyEnv, masterKeyEnv: cfg.masterKeyEnv, env: cfg.env });
  const inferenceKey = secrets[validated.inferenceKeyEnv as string];
  if (typeof inferenceKey !== "string" || !inferenceKey.trim()) throw new Error(`configuração LiteLLM inválida: credencial de inferência '${validated.inferenceKeyEnv}' ausente ou vazia`);
  return Object.fromEntries(Object.entries(validated.env).map(([name, template]) => [name, template.replace(/\{hostBaseUrl\}/g, validated.hostBaseUrl ?? "").replace(/\{containerBaseUrl\}/g, validated.containerBaseUrl ?? "").replace(/\{inferenceKey\}/g, inferenceKey)]));
}

/** Merges gateway values after provider extraEnv; mapped gateway names deliberately win. */
export function applyLitellmGatewayEnv(providerEnv: Record<string, string>, gatewayEnv: Record<string, string>): Record<string, string> {
  return { ...providerEnv, ...gatewayEnv };
}

/** Builds runtime variables without copying unrelated process.env values into the child. */
export function buildLitellmRuntimeEnv(
  providerEnv: Record<string, string> = {},
  cfg: LitellmGatewayConfig = getLitellmGatewayConfig(),
): Record<string, string> {
  if (!cfg.enabled) return { ...providerEnv };
  const secrets = { ...process.env, ...providerEnv } as Record<string, string | undefined>;
  const resolvedSecrets: Record<string, string> = {};
  for (const [name, value] of Object.entries(secrets)) if (typeof value === "string") resolvedSecrets[name] = value;
  const gateway = litellmGatewayEnv(cfg, resolvedSecrets);
  const mapped = new Set(Object.keys(gateway));
  const extras = Object.fromEntries(Object.entries(providerEnv).filter(([name]) => name !== cfg.masterKeyEnv && !mapped.has(name)));
  return applyLitellmGatewayEnv(extras, gateway);
}
