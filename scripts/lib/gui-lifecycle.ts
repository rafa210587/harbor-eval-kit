import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { parsePodmanConnections, parsePodmanMachines, selectConfiguredMachine } from "./podman.ts";
import type { PodmanPlatform, PodmanRunner } from "./podman.ts";

export interface ProcessRecord {
  pid: number;
  commandLine: string;
}

export interface GuiStatus {
  gui: "up" | "down";
  url: string;
  payload?: Record<string, unknown>;
}

function normalized(value: string): string {
  const path = value.replaceAll("\\", "/");
  return process.platform === "win32" ? path.toLowerCase() : path;
}

function commandTokens(value: string): string[] {
  const tokens: string[] = [];
  for (const match of value.matchAll(/"([^"]*)"|'([^']*)'|([^\s]+)/g)) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
}

/** Identity proof requires this repository's script path and the requested port. */
export function isGuiProcess(record: ProcessRecord, projectRoot: string, port: number): boolean {
  const tokens = commandTokens(record.commandLine);
  const executable = normalized(tokens[0] ?? "").split("/").pop();
  if (executable !== "node" && executable !== "node.exe") return false;
  const script = normalized(resolve(projectRoot, "scripts", "gui-server.ts"));
  // The launchers invoke `node <absolute-script>`. A different program merely mentioning
  // the GUI path as one of its own arguments is not proof of ownership.
  if (normalized(tokens[1] ?? "") !== script) return false;
  const inlinePort = tokens.find(token => token.startsWith("--port="));
  if (inlinePort) return Number(inlinePort.slice("--port=".length)) === port;
  const portIndex = tokens.indexOf("--port");
  return portIndex >= 0 ? Number(tokens[portIndex + 1]) === port : port === 4173;
}

export function guiStopInvocation(platform: NodeJS.Platform, pid: number): { command: string; args: string[] } {
  return platform === "win32"
    ? { command: "taskkill", args: ["/PID", String(pid), "/F"] }
    : { command: "kill", args: [String(pid)] };
}

export function parseWindowsProcesses(value: string): ProcessRecord[] {
  if (!value.trim()) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error("Could not parse the Windows process list"); }
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows.flatMap(row => {
    if (!row || typeof row !== "object") return [];
    const item = row as { ProcessId?: unknown; CommandLine?: unknown };
    const pid = Number(item.ProcessId);
    return Number.isInteger(pid) && typeof item.CommandLine === "string"
      ? [{ pid, commandLine: item.CommandLine }]
      : [];
  });
}

export function parseUnixProcesses(value: string): ProcessRecord[] {
  return value.split(/\r?\n/).flatMap(line => {
    const match = line.trim().match(/^(\d+)\s+(.+)$/);
    return match ? [{ pid: Number(match[1]), commandLine: match[2] }] : [];
  });
}

export function listProcesses(platform: NodeJS.Platform = process.platform): ProcessRecord[] {
  if (platform === "win32") {
    const script = "Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress";
    const output = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    });
    return parseWindowsProcesses(output);
  }
  const output = execFileSync("ps", ["-axo", "pid=,command="], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
  return parseUnixProcesses(output);
}

export async function readGuiStatus(port: number, fetcher: typeof fetch = fetch): Promise<GuiStatus> {
  const url = `http://127.0.0.1:${port}`;
  try {
    const response = await fetcher(`${url}/api/status`, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return { gui: "down", url };
    const payload = await response.json() as Record<string, unknown>;
    const harbor = payload.harbor as Record<string, unknown> | undefined;
    const podman = payload.podman as Record<string, unknown> | undefined;
    if (!harbor || !podman || typeof payload.platform !== "string" || typeof payload.stateDir !== "string") {
      return { gui: "down", url };
    }
    return { gui: "up", url, payload };
  } catch { return { gui: "down", url }; }
}

/** Starts only the explicitly selected Podman machine. Linux rootless has no start action. */
export function ensurePodmanRunning(platform: PodmanPlatform, run: PodmanRunner): void {
  try {
    run("podman", ["info", "--format", "json"]);
    return;
  } catch (error) {
    if (platform === "linux") throw error;
  }
  const connections = parsePodmanConnections(run("podman", ["system", "connection", "list", "--format", "json"]));
  const machines = parsePodmanMachines(run("podman", ["machine", "list", "--format", "json"]));
  const selected = selectConfiguredMachine(connections, machines);
  run("podman", ["machine", "start", selected.machine.name]);
  run("podman", ["--connection", selected.connection.name, "info", "--format", "json"]);
}

export function findGuiProcesses(projectRoot: string, port: number, processes = listProcesses()): ProcessRecord[] {
  return processes.filter(record => isGuiProcess(record, projectRoot, port));
}

export async function stopGui(options: {
  projectRoot: string;
  port: number;
  platform?: NodeJS.Platform;
  processes?: () => ProcessRecord[];
  kill?: (pid: number) => void;
}): Promise<number | null> {
  const platform = options.platform ?? process.platform;
  const processes = options.processes ?? (() => listProcesses(platform));
  const matches = findGuiProcesses(options.projectRoot, options.port, processes());
  if (!matches.length) return null;
  if (matches.length > 1) throw new Error("More than one matching Harbor Eval Kit GUI process was found; refusing to choose");
  const target = matches[0];
  const kill = options.kill ?? ((pid: number) => {
    if (platform === "win32") {
      const invocation = guiStopInvocation(platform, pid);
      execFileSync(invocation.command, invocation.args, { stdio: "ignore" });
    } else {
      process.kill(pid, "SIGTERM");
    }
  });
  kill(target.pid);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!findGuiProcesses(options.projectRoot, options.port, processes()).some(item => item.pid === target.pid)) {
      return target.pid;
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
  }
  throw new Error(`GUI process ${target.pid} is still running after the stop request`);
}
