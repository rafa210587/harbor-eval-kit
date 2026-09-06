// Secrets: provider API keys, kept in the state dir OUTSIDE the repo and never returned by
// any API (listings give names, not values). See docs/ENGENHARIA.md §1.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { getStateDir } from "./paths.ts";

// never written into the installation manifest, never logged.

export function getSecretsPath(): string {
  return join(getStateDir(), "secrets.env");
}

export function loadSecretsEnv(): Record<string, string> {
  const p = getSecretsPath();
  if (!existsSync(p)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(p, "utf-8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return out;
}

export function listSecretNames(): string[] {
  return Object.keys(loadSecretsEnv()).sort();
}

function writeSecretsEnv(secrets: Record<string, string>): void {
  const p = getSecretsPath();
  mkdirSync(dirname(p), { recursive: true });
  const lines = Object.entries(secrets).map(([k, v]) => `${k}=${v}`);
  writeFileSync(p, lines.join("\n") + (lines.length ? "\n" : ""), { mode: 0o600 });
}

export function saveSecret(name: string, value: string): void {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
    throw new Error("Secret name must be UPPER_SNAKE_CASE (e.g. ANTHROPIC_API_KEY)");
  }
  if (/[\r\n]/.test(value)) {
    throw new Error("Secret value cannot contain newlines");
  }
  const secrets = loadSecretsEnv();
  secrets[name] = value;
  writeSecretsEnv(secrets);
}

export function deleteSecret(name: string): void {
  const secrets = loadSecretsEnv();
  delete secrets[name];
  writeSecretsEnv(secrets);
}
