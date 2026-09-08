import { execFileSync } from "node:child_process";
import { request } from "node:http";

export type PodmanPlatform = "win32" | "darwin" | "linux";

export interface PodmanRunOptions {
  extraEnv?: Record<string, string>;
}

export type PodmanRunner = (
  command: string,
  args: string[],
  options?: PodmanRunOptions,
) => string;

export interface ResolvedPodmanConnection {
  platform: PodmanPlatform;
  dockerHost: string;
  connectionName: string | null;
  machineName: string | null;
  podmanUri: string | null;
  source: "machine" | "rootless";
}

interface ConnectionRecord {
  name: string;
  uri: string;
  isDefault: boolean;
}

interface MachineRecord {
  name: string;
  running: boolean;
}

function records(value: string, description: string): Record<string, unknown>[] {
  let parsed: unknown;
  try { parsed = JSON.parse(value); }
  catch { throw new Error(`Podman returned invalid JSON for ${description}`); }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  if (!list.every(item => item && typeof item === "object")) {
    throw new Error(`Podman returned an invalid ${description} payload`);
  }
  return list as Record<string, unknown>[];
}

function field(record: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    const key = Object.keys(record).find(candidate => candidate.toLowerCase() === name.toLowerCase());
    if (key !== undefined) return record[key];
  }
  return undefined;
}

export function parsePodmanConnections(value: string): ConnectionRecord[] {
  return records(value, "connection list").map(record => ({
    name: String(field(record, "Name") ?? ""),
    uri: String(field(record, "URI", "Uri") ?? ""),
    isDefault: field(record, "Default") === true,
  })).filter(connection => connection.name && connection.uri);
}

export function parsePodmanMachines(value: string): MachineRecord[] {
  if (!value.trim()) return [];
  return records(value, "machine list").map(record => ({
    name: String(field(record, "Name") ?? ""),
    running: field(record, "Running") === true,
  })).filter(machine => machine.name);
}

/** Selects one running machine from explicit Podman state; never relies on implicit defaults. */
export function selectEffectiveMachine(
  connections: ConnectionRecord[],
  machines: MachineRecord[],
): { machine: MachineRecord; connection: ConnectionRecord } {
  const running = machines.filter(machine => machine.running);
  if (!running.length) throw new Error("No running Podman machine was found");
  return selectConfiguredMachine(connections, running);
}

/** Selects the machine tied to the configured connection, whether stopped or running. */
export function selectConfiguredMachine(
  connections: ConnectionRecord[],
  machines: MachineRecord[],
): { machine: MachineRecord; connection: ConnectionRecord } {
  if (!machines.length) throw new Error("No Podman machine was found");
  const defaults = connections.filter(connection => connection.isDefault);
  if (defaults.length > 1) throw new Error("Podman reports more than one default connection");

  const pairs = machines.flatMap(machine => connections
    .filter(connection => connection.name === machine.name || connection.name === `${machine.name}-root`)
    .map(connection => ({ machine, connection })));
  const defaultPairs = defaults.length
    ? pairs.filter(pair => pair.connection.name === defaults[0].name)
    : [];
  if (defaultPairs.length === 1) return defaultPairs[0];
  if (defaultPairs.length > 1) throw new Error("Podman machines are ambiguous; a connection name matches multiple machines");
  if (pairs.length === 1) return pairs[0];
  throw new Error("Podman machines are ambiguous; select one Podman system connection explicitly");
}

function asUnixUrl(path: string): string {
  return path.startsWith("unix://") ? path : `unix://${path}`;
}

function socketFromInspect(value: string): string {
  const [inspect] = records(value, "machine inspect");
  const connectionInfo = field(inspect, "ConnectionInfo") as Record<string, unknown> | undefined;
  const socket = connectionInfo && field(connectionInfo, "PodmanSocket") as Record<string, unknown> | undefined;
  const path = socket && field(socket, "Path");
  if (!path) throw new Error("Selected Podman machine did not report a host API socket");
  return String(path);
}

function socketFromInfo(value: string): string {
  const [info] = records(value, "info");
  const host = field(info, "Host") as Record<string, unknown> | undefined;
  const remote = host && field(host, "RemoteSocket") as Record<string, unknown> | undefined;
  const path = remote && field(remote, "Path");
  if (!path) throw new Error("Rootless Podman did not report an active API socket");
  return String(path);
}

export const defaultPodmanRunner: PodmanRunner = (command, args, options) =>
  execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...options?.extraEnv },
  });

/** Discovers the selected connection and returns the child-scoped DOCKER_HOST value. */
export function resolvePodmanConnection(options: {
  platform?: NodeJS.Platform;
  run?: PodmanRunner;
} = {}): ResolvedPodmanConnection {
  const platform = options.platform ?? process.platform;
  if (platform !== "win32" && platform !== "darwin" && platform !== "linux") {
    throw new Error(`Unsupported Podman platform: ${platform}`);
  }
  const run = options.run ?? defaultPodmanRunner;
  const connections = parsePodmanConnections(run("podman", ["system", "connection", "list", "--format", "json"]));
  let machines: MachineRecord[] = [];
  try { machines = parsePodmanMachines(run("podman", ["machine", "list", "--format", "json"])); }
  catch {
    if (platform !== "linux") throw new Error("Could not inspect Podman machines");
  }

  if (machines.some(machine => machine.running)) {
    const { machine, connection } = selectEffectiveMachine(connections, machines);
    const inspect = run("podman", ["machine", "inspect", machine.name, "--format", "json"]);
    const dockerHost = platform === "win32"
      ? "npipe:////./pipe/docker_engine"
      : asUnixUrl(socketFromInspect(inspect));
    return {
      platform,
      dockerHost,
      connectionName: connection.name,
      machineName: machine.name,
      podmanUri: connection.uri,
      source: "machine",
    };
  }

  if (platform !== "linux") throw new Error("Podman requires a running machine on this platform");
  const defaults = connections.filter(connection => connection.isDefault);
  if (defaults.length > 1) throw new Error("Podman reports more than one default connection");
  const info = run("podman", ["info", "--format", "json"]);
  return {
    platform,
    dockerHost: asUnixUrl(socketFromInfo(info)),
    connectionName: defaults[0]?.name ?? null,
    machineName: null,
    podmanUri: defaults[0]?.uri ?? null,
    source: "rootless",
  };
}

export interface PodmanApiResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

export type PodmanApiRequester = (dockerHost: string, path: string) => Promise<PodmanApiResponse>;

function namedPipePath(dockerHost: string): string {
  if (dockerHost !== "npipe:////./pipe/docker_engine") {
    throw new Error(`Unsupported Podman named pipe: ${dockerHost}`);
  }
  return "\\\\.\\pipe\\docker_engine";
}

export const requestPodmanApi: PodmanApiRequester = (dockerHost, path) => new Promise((done, reject) => {
  const socketPath = dockerHost.startsWith("unix://")
    ? dockerHost.slice("unix://".length)
    : namedPipePath(dockerHost);
  const req = request({ socketPath, path, method: "GET", timeout: 5_000 }, response => {
    let body = "";
    response.setEncoding("utf8");
    response.on("data", chunk => { body += chunk; });
    response.on("end", () => done({
      statusCode: response.statusCode ?? 0,
      headers: response.headers,
      body,
    }));
  });
  req.on("timeout", () => req.destroy(new Error("Podman API probe timed out")));
  req.on("error", reject);
  req.end();
});

export function assertPodmanApi(response: PodmanApiResponse): void {
  if (response.statusCode !== 200) throw new Error(`Podman API /version returned HTTP ${response.statusCode}`);
  const header = response.headers["libpod-api-version"];
  let parsed: unknown;
  try { parsed = JSON.parse(response.body); } catch { parsed = null; }
  const podmanBody = parsed && JSON.stringify(parsed).toLowerCase().includes("podman");
  if (!header && !podmanBody) {
    throw new Error("The resolved Docker-compatible endpoint did not identify itself as Podman");
  }
}

/** Read-only CLI/API/Compose gates. It never starts a machine or creates a resource. */
export async function validatePodmanInterfaces(
  resolved: ResolvedPodmanConnection,
  options: { run?: PodmanRunner; requestApi?: PodmanApiRequester } = {},
): Promise<void> {
  const run = options.run ?? defaultPodmanRunner;
  const args = resolved.connectionName
    ? ["--connection", resolved.connectionName, "info", "--format", "json"]
    : ["info", "--format", "json"];
  records(run("podman", args), "selected connection info");
  assertPodmanApi(await (options.requestApi ?? requestPodmanApi)(resolved.dockerHost, "/version"));
  run("podman", ["compose", "version"], { extraEnv: { DOCKER_HOST: resolved.dockerHost } });
  const composeHelp = run("podman", ["compose", "up", "--help"], { extraEnv: { DOCKER_HOST: resolved.dockerHost } });
  for (const flag of ["--wait", "--pull"]) {
    if (!composeHelp.includes(flag)) throw new Error(`Podman Compose provider does not support required '${flag}'`);
  }
}
