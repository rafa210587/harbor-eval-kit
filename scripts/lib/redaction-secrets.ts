// Redaction-only inputs. Never pass this dictionary as a child process environment.
import { loadSecretsEnv } from "./secrets.ts";
import { getHarnessSecretValues } from "./harness-sensitive.ts";
export function loadRedactionSecrets(): Record<string, string> {
  return { ...loadSecretsEnv(), ...Object.fromEntries(getHarnessSecretValues().map((value, index) => [`NATIVE_REDACTION_${index}`, value])) };
}
