// LiteLLM gateway: a PREPARED, DISABLED integration point. See DOCUMENTACAO.md §5.1-b.
// With no config file (the default) this contributes nothing at all, which is the property
// the tests pin down.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getStateDir } from "./paths.ts";

// LiteLLM is ALREADY used by this kit in one place: the Secrets "Test" button calls
// litellm.completion()/get_valid_models() directly, in Harbor's own venv (see
// TEST_PROVIDER_KEY_SCRIPT). That is the SDK, in this process, and needs no seam.
//
// This section is the *other* integration people mean by "LiteLLM": running a LiteLLM **proxy**
// and pointing the agents at it, which buys one place for keys, spend caps, caching, fallbacks
// and request logs across every provider -- and, in principle, lets a vendor-locked adapter
// (claude-code, codex) reach a model from another provider, the exact limitation documented in
// docs/COMO_FUNCIONA.md §4.4.
//
// Wiring an agent to a proxy means one thing: setting *_BASE_URL/API key env vars on the
// `harbor` child process. buildHarborEnv() is the single choke point where that happens, so
// this is the whole seam -- one more decorator alongside withTelemetryDisabled/withPythonUtf8.
//
// HONESTY: nothing here has been run against a real LiteLLM proxy. It is a prepared, disabled
// hook, not a supported feature. Which env var each adapter honours is therefore NOT guessed
// here -- the config declares the mapping explicitly, so enabling it is a deliberate act by
// someone who verified their own setup. Until then it must be a strict no-op: with no config
// file (the default), buildHarborEnv() produces exactly what it did before this existed, which
// is what the tests pin down.

export interface LitellmGatewayConfig {
  enabled: boolean;
  /** Proxy base URL, e.g. "http://127.0.0.1:4000". */
  baseUrl: string | null;
  /** Name of the secret (in secrets.env) holding the proxy's master key, if it needs one. */
  apiKeyEnv: string | null;
  /**
   * Env vars to set on the harbor child process when enabled. Values may use the placeholders
   * `{baseUrl}` and `{apiKey}`. Declared rather than inferred: this kit does not know which
   * variable a given adapter reads, and pretending to would be the kind of guess that fails
   * silently at run time.
   */
  env: Record<string, string>;
}

export const LITELLM_GATEWAY_DISABLED: LitellmGatewayConfig = {
  enabled: false,
  baseUrl: null,
  apiKeyEnv: null,
  env: {},
};

export function getLitellmGatewayPath(): string {
  return join(getStateDir(), "litellm-gateway.json");
}

/**
 * Reads the gateway config from the state dir. Absent, unreadable or malformed all mean
 * "disabled" -- a broken config must never silently redirect model traffic somewhere
 * unexpected, and must never stop a normal run from working.
 */
export function getLitellmGatewayConfig(): LitellmGatewayConfig {
  const path = getLitellmGatewayPath();
  if (!existsSync(path)) return LITELLM_GATEWAY_DISABLED;
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as Partial<LitellmGatewayConfig>;
    if (raw.enabled !== true) return LITELLM_GATEWAY_DISABLED;
    return {
      enabled: true,
      baseUrl: typeof raw.baseUrl === "string" && raw.baseUrl.trim() ? raw.baseUrl.trim() : null,
      apiKeyEnv: typeof raw.apiKeyEnv === "string" && raw.apiKeyEnv.trim() ? raw.apiKeyEnv.trim() : null,
      env: raw.env && typeof raw.env === "object" ? (raw.env as Record<string, string>) : {},
    };
  } catch {
    return LITELLM_GATEWAY_DISABLED;
  }
}

/**
 * The env vars the gateway contributes. Returns `{}` unless it is enabled AND has a baseUrl AND
 * declares at least one variable -- a half-filled config contributes nothing rather than
 * something partly wired.
 *
 * `secrets` is passed in rather than read here so the secret lookup stays visible at the call
 * site, same discipline as everywhere else in this file.
 */
export function litellmGatewayEnv(
  cfg: LitellmGatewayConfig = getLitellmGatewayConfig(),
  secrets: Record<string, string> = {}
): Record<string, string> {
  if (!cfg.enabled || !cfg.baseUrl) return {};
  const apiKey = cfg.apiKeyEnv ? secrets[cfg.apiKeyEnv] ?? "" : "";
  const out: Record<string, string> = {};
  for (const [name, template] of Object.entries(cfg.env)) {
    if (typeof template !== "string") continue;
    out[name] = template.replace(/\{baseUrl\}/g, cfg.baseUrl).replace(/\{apiKey\}/g, apiKey);
  }
  return out;
}
