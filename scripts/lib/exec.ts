// Spawning harbor/podman: the single choke point where every child process gets its
// environment (secrets, DOCKER_HOST, telemetry off, UTF-8, the LiteLLM gateway seam).
// Anything that shells out goes through here, so the secret path stays auditable in one
// place -- see docs/ENGENHARIA.md §1 and §4.

import { spawn, execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { getStateDir, safeJoinUnderDir } from "./paths.ts";
import { discoverCleanupResources, planCleanup } from "./cleanup.ts";
import type { CleanupExecutor } from "./cleanup.ts";
import { loadInstallationManifest } from "./installation.ts";
import type { ExecOptions, ExecResult } from "./types.ts";
import { getLitellmGatewayConfig, buildLitellmRuntimeEnv, applyLitellmGatewayEnv } from "./litellm.ts";
import { resolvePodmanConnection, validatePodmanInterfaces } from "./podman.ts";
import { managedRunArgs, managedRuntimeEnv } from "./managed-runtime.ts";
import { getHarborPythonPath } from "./harbor-python.ts";

/** Read-only discovery. Doctor validates the API before a real smoke/run. */
export function resolvePodmanDockerHost(): string | null {
  try { return resolvePodmanConnection().dockerHost; } catch { return null; }
}

/**
 * Harbor's CLI callback fires PostHog telemetry on every command by default
 * (harbor/telemetry.py: capture_command_finished/capture_job_finished, wired into
 * harbor/cli/main.py's top-level callback) -- agent names, model provider+name, reward,
 * cost, token counts and an anonymous install id leave the machine unless this is set.
 * Verified no API key ever enters that payload (it's filtered through a fixed field
 * allowlist), but usage data does, which this kit disables unconditionally: unlike the
 * DOCKER_HOST pipe redirect below, this isn't Windows/Podman-specific plumbing, so it must
 * not be skippable via dockerHostFix/--no-docker-host-fix.
 */
function withTelemetryDisabled(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  env.HARBOR_TELEMETRY = "disabled";
  return env;
}

/**
 * Harbor's CLI (via `rich`) prints emoji straight to stdout (e.g. "\U0001f50d" before
 * "Analyzing trial(s)..." in harbor/cli/analyze.py). Spawned as a child process on Windows,
 * Python defaults its stdout encoding to the console's active code page (cp1252 unless the
 * terminal itself is already in UTF-8 mode) instead of UTF-8, so that print crashes with
 * UnicodeEncodeError before the command does anything else -- reproduced running `harbor
 * analyze` through this GUI. Forcing UTF-8 here fixes it regardless of the host console's
 * code page, same unconditional-fix pattern as withTelemetryDisabled above.
 */
function withPythonUtf8(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (env.PYTHONIOENCODING === undefined) env.PYTHONIOENCODING = "utf-8";
  return env;
}

// ---------- LiteLLM gateway (integration point -- OFF by default, never yet exercised) ----------
//

export function buildHarborEnv(
  extraEnv: Record<string, string> = {},
  gateway?: Record<string, string>
): NodeJS.ProcessEnv {
  const cfg = gateway === undefined ? getLitellmGatewayConfig() : null;
  const runtime = cfg ? buildLitellmRuntimeEnv(extraEnv, cfg) : applyLitellmGatewayEnv(extraEnv, gateway ?? {});
  const env: NodeJS.ProcessEnv = { ...process.env, ...runtime };
  if (cfg?.enabled && cfg.masterKeyEnv) delete env[cfg.masterKeyEnv];
  if (env.DOCKER_HOST === undefined) {
    const dockerHost = resolvePodmanDockerHost();
    if (dockerHost) env.DOCKER_HOST = dockerHost;
  }
  return withPythonUtf8(withTelemetryDisabled(env));
}

export function execCommand(
  cmd: string,
  args: string[],
  opts: ExecOptions = {}
): Promise<ExecResult> {
  return new Promise((resolvePromise) => {
    const start = Date.now();
    const dockerHostFix = opts.dockerHostFix ?? true;
    const env = dockerHostFix
      ? buildHarborEnv(opts.extraEnv)
      : withPythonUtf8(withTelemetryDisabled({ ...process.env, ...opts.extraEnv }));
    // stdin is explicitly closed ("ignore"), never left as an open, silently-empty pipe.
    // Found by testing: `harbor init --task` with no --org and a bare (no "/") name prompts
    // interactively for "Organization: " on stdin. A default `spawn()` pipe leaves that stdin
    // open but never written to, so the CLI just sits there -- the request only ever ends via
    // the 60s timeout, surfacing as an opaque "Internal Server Error" instead of a fast, clear
    // failure. Closing stdin makes any interactive prompt (this one, or one we haven't hit yet
    // in some other harbor subcommand) fail immediately with EOF instead of hanging for a
    // minute -- defense in depth on top of the actual fix, which is validating --org up front
    // (see the /api/tasks/init route).
    const child = spawn(cmd, args, { env, cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"] });
    opts.onSpawn?.(child);
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill();
        }, opts.timeoutMs)
      : undefined;
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
      if (opts.echo) process.stdout.write(d);
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
      if (opts.echo) process.stderr.write(d);
    });
    child.on("close", (code, signal) => {
      if (timer) clearTimeout(timer);
      // code is null when the process was killed by a signal rather than exiting on its own --
      // via the timeout above, or via an external child.kill() (e.g. /api/compare/cancel).
      // Distinguishing the two in the message is what lets a cancelled row read "cancelled by
      // user" instead of the more alarming "exit 1" a plain code-only check would show.
      let note = "";
      if (timedOut) note = `\n[killed: exceeded ${opts.timeoutMs}ms timeout]`;
      else if (code === null && signal) note = `\n[killed: signal ${signal}]`;
      resolvePromise({
        code: code ?? 1,
        stdout,
        stderr: note ? `${stderr}${note}` : stderr,
        durationSec: (Date.now() - start) / 1000,
      });
    });
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      resolvePromise({
        code: 1,
        stdout,
        stderr: stderr + String(err),
        durationSec: (Date.now() - start) / 1000,
      });
    });
  });
}

export async function execHarbor(args: string[], opts: ExecOptions = {}): Promise<ExecResult> {
  const managedArgs = managedRunArgs(args);
  const extraEnv = managedRuntimeEnv(args, opts.extraEnv);
  if (["run", "analyze"].includes(args[0]) && !args.includes("--print-config")) {
    const connection = resolvePodmanConnection();
    await validatePodmanInterfaces(connection);
    extraEnv.DOCKER_HOST = connection.dockerHost;
    if (connection.connectionName) extraEnv.CONTAINER_CONNECTION = connection.connectionName;
  }
  if (args[0] === "analyze") {
    const python = getHarborPythonPath();
    if (!python) throw new Error("Python do Harbor via uv não encontrado; execute o doctor");
    return execCommand(python, ["-m", "harbor_eval_kit.cli", ...managedArgs], { ...opts, extraEnv });
  }
  return execCommand("harbor", managedArgs, { ...opts, extraEnv });
}

/** Cancellation stops only manifest-owned, labeled containers with the exact trial service
 * name. Harbor resources without ownership records are deliberately left for inspection.
 * Returns only names confirmed absent from the running-container list after stop. */
export function stopContainersForJob(
  jobsDir: string,
  jobName: string,
  options: { manifestPath?: string; run?: CleanupExecutor } = {}
): string[] {
  const run = options.run ?? ((command: string, args: string[]) =>
    execFileSync(command, args, { stdio: ["ignore", "pipe", "ignore"], encoding: "utf8" }));
  const stopped: string[] = [];
  try {
    const jobDir = safeJoinUnderDir(jobsDir, jobName);
    if (!jobDir || !existsSync(jobDir)) return [];
    const manifest = loadInstallationManifest(options.manifestPath ?? process.env.HARBOR_EVAL_MANIFEST ?? join(getStateDir(), "installation-manifest.json"));
    const expected = new Set(readdirSync(jobDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && !entry.isSymbolicLink())
      .map(entry => `${entry.name.toLowerCase()}__env-main-1`));
    for (const entry of manifest.managed_resources.containers) {
      if (typeof entry === "object" && entry?.jobPath && resolve(entry.jobPath) === resolve(jobDir) && typeof entry.name === "string") expected.add(entry.name.toLowerCase());
    }
    if (!expected.size) return [];
    const running = () => new Set(run("podman", ["ps", "-q", "--no-trunc"]).split(/\r?\n/).map(id => id.trim()).filter(Boolean));
    const active = running();
    for (const resource of discoverCleanupResources(run)) {
      if (resource.kind !== "containers" || !active.has(resource.id)) continue;
      const name = resource.names[0]?.replace(/^\//, "");
      if (!name || !expected.has(name.toLowerCase())) continue;
      try {
        // Reuse the same ownership proof as uninstall, excluding dependency removal.
        planCleanup({ ...manifest, installed_by_kit: {} }, [resource]);
        run("podman", ["stop", "-t", "2", resource.id]);
        if (!running().has(resource.id)) stopped.push(name);
      } catch { /* Ambiguous ownership or failed stop: never claim it stopped. */ }
    }
  } catch { /* Cancellation itself remains available when manifest/Podman is unavailable. */ }
  return stopped;
}
export function isHarborAvailable(): boolean {
  try {
    execFileSync("harbor", ["--version"], { stdio: "ignore", env: { ...process.env, HARBOR_TELEMETRY: "disabled", PYTHONIOENCODING: "utf-8" } });
    return true;
  } catch {
    return false;
  }
}

export async function runPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function runner(): Promise<void> {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await worker(items[idx], idx);
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, () => runner());
  await Promise.all(runners);
  return results;
}
