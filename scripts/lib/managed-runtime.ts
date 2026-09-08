// Route only local evaluations through the Harbor extension; no global Harbor patch or CLI alias.
import { delimiter, join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { getStateDir } from "./paths.ts";
import { loadInstallationManifest, snapshotInstallation } from "./installation.ts";

export const MANAGED_ENVIRONMENT = "harbor_eval_kit.managed:ManagedPodmanEnvironment";
export const RUNTIME_PYTHON_DIR = resolve(import.meta.dirname, "..", "python");

export function managedRunArgs(args: string[]): string[] {
  if (!["run", "analyze"].includes(args[0])) return [...args];
  // Analyze's CLI accepts an enum only. Its subprocess bootstrap scopes the same
  // managed adapter to that enum without modifying the installed Harbor package.
  const target = args[0] === "analyze" ? "docker" : MANAGED_ENVIRONMENT;
  const out = [...args];
  let found = false;
  for (let i = 1; i < out.length; i++) {
    const compact = out[i].startsWith("-e") && !out[i].startsWith("--") && out[i].length > 2;
    const flag = out[i].split("=")[0];
    if (!compact && !["--env", "--environment", "-e"].includes(flag)) continue;
    const inline = out[i].includes("=");
    const value = compact ? out[i].slice(2).replace(/^=/, "") : inline ? out[i].slice(out[i].indexOf("=") + 1) : out[i + 1];
    if (!["docker", MANAGED_ENVIRONMENT].includes(value)) throw new Error("Execução local requer o adaptador Podman gerenciado; outros ambientes não estão habilitados");
    if (found) throw new Error("Ambiente duplicado na execução");
    found = true;
    if (compact) {
      out.splice(i, 1, "--env", target);
      i++;
    }
    else if (inline) out[i] = `${flag}=${target}`;
    else out[++i] = target;
  }
  if (!found) out.push("--env", target);
  return out;
}

export function managedRuntimeEnv(args: string[], extra: Record<string, string> = {}): Record<string, string> {
  if (!["run", "analyze"].includes(args[0])) return extra;
  const manifest = process.env.HARBOR_EVAL_MANIFEST || join(getStateDir(), "installation-manifest.json");
  if (!args.includes("--print-config")) {
    // Never rewrite a live manifest while parallel Python trials record their resources.
    if (!existsSync(manifest)) snapshotInstallation(manifest);
    else loadInstallationManifest(manifest);
  }
  return { ...extra, HARBOR_EVAL_MANIFEST: manifest,
    PYTHONPATH: [RUNTIME_PYTHON_DIR, process.env.PYTHONPATH].filter(Boolean).join(delimiter) };
}
