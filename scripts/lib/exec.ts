// Spawning harbor/podman: the single choke point where every child process gets its
// environment (secrets, DOCKER_HOST, telemetry off, UTF-8, the LiteLLM gateway seam).
// Anything that shells out goes through here, so the secret path stays auditable in one
// place -- see docs/ENGENHARIA.md §1 and §4.

import { spawn, execFileSync } from "node:child_process";

import type { ExecOptions, ExecResult } from "./types.ts";
import { getLitellmGatewayConfig, litellmGatewayEnv } from "./litellm.ts";

/**
 * On Windows, Docker Desktop's own pipe is the CLI/SDK default context even when it's
 * stopped; the Podman machine forwards its Docker-compatible API to a different, generic
 * pipe. On macOS and Linux the same class of problem can show up differently (no Docker
 * Desktop pipe to collide with, but Harbor's Docker-oriented backend still needs to be
 * pointed at Podman's actual socket rather than assuming the Docker CLI's own default).
 * Scoping DOCKER_HOST to a single spawned child (never process.env globally) routes that one
 * call to Podman without touching the caller's shell or any other tool on the host.
 */
let cachedPodmanDockerHost: string | null | undefined; // undefined = not resolved yet this process

/**
 * Resolves the DOCKER_HOST value that reaches Podman's Docker-compatible API, per platform:
 *
 * - **win32**: a fixed, well-known named pipe (`docker_engine`) that Podman machine exposes
 *   specifically for Docker-CLI/SDK compatibility, distinct from its own per-machine-named
 *   native API pipe (confirmed: `podman machine inspect` reports the native pipe as
 *   `\\.\pipe\podman-machine-default`, a different, machine-name-dependent value) -- this is
 *   the value validated by every real `harbor run` in this kit's own testing, kept hardcoded
 *   rather than "discovered" because there's nothing to discover it from.
 * - **darwin**: Podman on macOS always runs inside a VM ("podman machine"); its Docker-API
 *   socket path is host-local but machine-name-dependent, so it's resolved dynamically via
 *   `podman machine inspect`.
 * - **linux**: rootless Podman normally exposes its API socket directly (no VM/machine layer)
 *   -- `podman info` reports that socket's real path, and unlike the Windows case, the same
 *   socket already speaks the Docker-compatible dialect (Podman's API server multiplexes
 *   both under one socket on Unix). If a Podman *machine* is active instead (uncommon on
 *   Linux, but supported), the same machine-inspect path as macOS is used.
 *
 * Best-effort: returns null if `podman` isn't on PATH, no machine/socket is found, or the
 * platform is unrecognized -- callers should leave DOCKER_HOST unset in that case and let
 * Harbor's own doctor gate surface a clear error rather than silently pointing at nothing.
 * Result is memoized per process (this shells out to `podman`, and buildHarborEnv() runs on
 * every child spawn).
 */
export function resolvePodmanDockerHost(): string | null {
  if (cachedPodmanDockerHost !== undefined) return cachedPodmanDockerHost;

  const run = (args: string[]): string | null => {
    try {
      return execFileSync("podman", args, { stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim() || null;
    } catch {
      return null;
    }
  };
  const asUnixUrl = (path: string | null): string | null =>
    path ? (path.startsWith("unix://") ? path : `unix://${path}`) : null;

  let result: string | null = null;
  if (process.platform === "win32") {
    result = "npipe:////./pipe/docker_engine";
  } else if (process.platform === "darwin") {
    result = asUnixUrl(run(["machine", "inspect", "--format", "{{.ConnectionInfo.PodmanSocket.Path}}"]));
  } else if (process.platform === "linux") {
    const machinesJson = run(["machine", "list", "--format", "json"]);
    let hasActiveMachine = false;
    if (machinesJson) {
      try {
        hasActiveMachine = (JSON.parse(machinesJson) as Array<{ Running?: boolean }>).some((m) => m.Running);
      } catch {
        hasActiveMachine = false;
      }
    }
    result = hasActiveMachine
      ? asUnixUrl(run(["machine", "inspect", "--format", "{{.ConnectionInfo.PodmanSocket.Path}}"]))
      : asUnixUrl(run(["info", "--format", "{{.Host.RemoteSocket.Path}}"]));
  }

  cachedPodmanDockerHost = result;
  return result;
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
  if (env.HARBOR_TELEMETRY === undefined) env.HARBOR_TELEMETRY = "disabled";
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
  gateway: Record<string, string> = litellmGatewayEnv(getLitellmGatewayConfig(), extraEnv)
): NodeJS.ProcessEnv {
  // Gateway vars go UNDER extraEnv: an explicit per-call value always wins over the ambient
  // gateway config, never the other way around.
  const env: NodeJS.ProcessEnv = { ...process.env, ...gateway, ...extraEnv };
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
    const child = spawn(cmd, args, { env, cwd: opts.cwd });
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
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolvePromise({
        code: timedOut ? 1 : code ?? 1,
        stdout,
        stderr: timedOut ? `${stderr}\n[killed: exceeded ${opts.timeoutMs}ms timeout]` : stderr,
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

export function execHarbor(args: string[], opts: ExecOptions = {}): Promise<ExecResult> {
  return execCommand("harbor", args, opts);
}

export function isHarborAvailable(): boolean {
  try {
    execFileSync("harbor", ["--version"], { stdio: "ignore" });
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
