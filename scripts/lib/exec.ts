// Spawning harbor/podman: the single choke point where every child process gets its
// environment (secrets, DOCKER_HOST, telemetry off, UTF-8, the LiteLLM gateway seam).
// Anything that shells out goes through here, so the secret path stays auditable in one
// place -- see docs/ENGENHARIA.md §1 and §4.

import { spawn, execFileSync, type ChildProcess } from "node:child_process";
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

const terminationRequested = new WeakSet<ChildProcess>();

function redactKnownValues(text: string, values: string[]): string {
  return values.reduce((clean, value) => value ? clean.split(value).join("[REDACTED]") : clean, text);
}

/** Holds only the suffix that could be the start of a secret split across chunks. */
export function createStreamingRedactor(values: string[], emit: (text: string) => void) {
  const secrets = [...new Set(values.filter(Boolean).flatMap(value => {
    const escaped = JSON.stringify(value).slice(1, -1);
    return escaped === value ? [value] : [value, escaped];
  }))].sort((a, b) => b.length - a.length);
  const tail = Math.max(0, ...secrets.map(value => value.length - 1));
  let pending = "";
  return {
    write(chunk: string) {
      pending += chunk;
      let cutoff = Math.max(0, pending.length - tail);
      for (const secret of secrets) {
        let start = pending.lastIndexOf(secret, cutoff);
        while (start >= 0 && start < cutoff && start + secret.length > cutoff) {
          cutoff = start;
          start = pending.lastIndexOf(secret, cutoff - 1);
        }
      }
      if (cutoff) {
        emit(redactKnownValues(pending.slice(0, cutoff), secrets));
        pending = pending.slice(cutoff);
      }
    },
    end() {
      if (pending) emit(redactKnownValues(pending, secrets));
      pending = "";
    },
  };
}

export function processDescendants(rootPid: number, processTable: string): number[] {
  const children = new Map<number, number[]>();
  for (const line of processTable.split(/\r?\n/)) {
    const match = line.trim().match(/^(\d+)\s+(\d+)$/);
    if (!match) continue;
    const [pid, parent] = [Number(match[1]), Number(match[2])];
    children.set(parent, [...(children.get(parent) ?? []), pid]);
  }
  const result: number[] = [];
  const visit = (pid: number) => { for (const child of children.get(pid) ?? []) { visit(child); result.push(child); } };
  visit(rootPid);
  return result;
}

/** Terminates only the process tree rooted at the child handle created by this executor. */
export function terminateProcessTree(child: ChildProcess, options: {
  platform?: NodeJS.Platform;
  run?: (command: string, args: string[]) => string;
  killPid?: (pid: number, signal: NodeJS.Signals) => void;
} = {}): number[] {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null || terminationRequested.has(child)) return [];
  terminationRequested.add(child);
  const platform = options.platform ?? process.platform;
  const run = options.run ?? ((command, args) => execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  if (platform === "win32") {
    try {
      run("taskkill", ["/PID", String(child.pid), "/T", "/F"]);
      return [child.pid];
    } catch {
      try { child.kill(); } catch { /* already exited */ }
      return [];
    }
  }
  let descendants: number[] = [];
  try { descendants = processDescendants(child.pid, run("ps", ["-axo", "pid=,ppid="])); } catch { /* parent remains killable */ }
  // Cancellation is an explicit force-stop. Kill only the PIDs derived from this
  // live child's PPID snapshot; immediate SIGKILL avoids a later PID-reuse race.
  const killPid = options.killPid ?? ((pid, signal) => { try { process.kill(pid, signal); } catch { /* already exited */ } });
  for (const pid of descendants) killPid(pid, "SIGKILL");
  child.kill("SIGKILL");
  return [...descendants, child.pid];
}

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
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    opts.onSpawn?.(child);
    let stdout = "";
    let stderr = "";
    const stdoutRedactor = createStreamingRedactor(opts.redactValues ?? [], text => {
      stdout += text;
      if (opts.echo) process.stdout.write(text);
    });
    const stderrRedactor = createStreamingRedactor(opts.redactValues ?? [], text => {
      stderr += text;
      if (opts.echo) process.stderr.write(text);
    });
    let timedOut = false;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          terminateProcessTree(child);
        }, opts.timeoutMs)
      : undefined;
    child.stdout.on("data", (d: string) => {
      stdoutRedactor.write(d);
    });
    child.stderr.on("data", (d: string) => {
      stderrRedactor.write(d);
    });
    child.on("close", (code, signal) => {
      if (timer) clearTimeout(timer);
      stdoutRedactor.end();
      stderrRedactor.end();
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
      stdoutRedactor.end();
      stderrRedactor.end();
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
    return execCommand(python, ["-m", "harbor_eval_kit.cli", ...managedArgs], { ...opts, extraEnv,
      redactValues: opts.redactValues ?? Object.values(opts.extraEnv ?? {}) });
  }
  return execCommand("harbor", managedArgs, { ...opts, extraEnv,
    redactValues: opts.redactValues ?? Object.values(opts.extraEnv ?? {}) });
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
