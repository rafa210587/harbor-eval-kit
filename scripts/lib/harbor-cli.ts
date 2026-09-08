import { execHarbor } from "./exec.ts";
import { loadSecretsEnv } from "./secrets.ts";
import type { ExecOptions, ExecResult } from "./types.ts";

export type HarborExecutor = (args: string[], options?: ExecOptions) => Promise<ExecResult>;

/** Shared CLI entry: secrets travel only in the child's environment and native exit is preserved. */
export async function runHarborEval(
  args: string[],
  options: { execute?: HarborExecutor; loadSecrets?: () => Record<string, string> } = {},
): Promise<number> {
  const execute = options.execute ?? execHarbor;
  const secrets = (options.loadSecrets ?? loadSecretsEnv)();
  const result = await execute(["run", ...args], { extraEnv: secrets, redactValues: Object.values(secrets), echo: true });
  return result.code;
}
