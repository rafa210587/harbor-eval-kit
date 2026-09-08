import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, delimiter, join } from 'node:path';
import { platform, arch } from 'node:os';
export const SNAPSHOT_TOOLS = ['podman', 'python', 'python3', 'py', 'uv', 'java', 'javac', 'mvn', 'gradle', 'node', 'npm', 'npx', 'harbor'];
export function findExecutable(tool: string): string | undefined {
  const extensions = process.platform === 'win32' ? ['', '.exe', '.cmd', '.bat'] : [''];
  return (process.env.PATH ?? '').split(delimiter).flatMap(dir => extensions.map(ext => join(dir, tool + ext))).find(path => existsSync(path));
}
export function loadInstallationManifest(path: string): any {
  const value = JSON.parse(readFileSync(path, 'utf8'));
  if (value.schema_version !== 1 || !value.preexisting || !value.installed_by_kit || !value.managed_resources) throw new Error('Invalid installation manifest');
  for (const kind of ['containers', 'images', 'volumes', 'networks']) if (!Array.isArray(value.managed_resources[kind])) throw new Error(`Invalid manifest resource list: ${kind}`);
  return value;
}
function writeInstallationManifest(path: string, value: any): void {
  const temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  renameSync(temp, path);
}

/** Shares the Python runtime lock and always reloads after acquiring it. */
export function updateInstallationManifest(path: string, update: (value: any) => void): any {
  const lock = `${path}.runtime-lock`;
  const deadline = Date.now() + 30_000;
  while (true) {
    try {
      const descriptor = openSync(lock, 'wx', 0o600);
      closeSync(descriptor);
      break;
    } catch (error: any) {
      if (error?.code !== 'EEXIST' || Date.now() >= deadline) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  try {
    const value = loadInstallationManifest(path);
    update(value);
    writeInstallationManifest(path, value);
    return value;
  } finally {
    unlinkSync(lock);
  }
}
/** The original snapshot is immutable across repeated installations. */
export function snapshotInstallation(path: string, locate = findExecutable): void {
  if (existsSync(path)) { loadInstallationManifest(path); return; }
  const preexisting = Object.fromEntries(SNAPSHOT_TOOLS.map(tool => {
    const executable = locate(tool);
    return [tool, { present: Boolean(executable), path: executable ?? null }];
  }));
  mkdirSync(dirname(path), { recursive: true });
  // Exclusive create refuses a competing installation rather than overwriting its snapshot.
  writeFileSync(path, `${JSON.stringify({ schema_version: 1, created_at: new Date().toISOString(), host: { platform: platform(), machine: arch() }, preexisting, installed_by_kit: {}, managed_resources: { containers: [], images: [], volumes: [], networks: [] }, notes: [] }, null, 2)}\n`, { flag: 'wx' });
}
export function markInstalledDependency(path: string, tool: string, locate = findExecutable): void {
  if (!['harbor', 'uv'].includes(tool)) throw new Error('Unsupported installed dependency');
  const executable = locate(tool);
  if (!executable) throw new Error(`Installed dependency not found: ${tool}`);
  updateInstallationManifest(path, value => {
    if (value.preexisting[tool]?.present !== false) throw new Error(`Cannot claim preexisting or unsnapshotted dependency: ${tool}`);
    value.installed_by_kit[tool] = { installed: true, path: executable, recorded_at: new Date().toISOString() };
  });
}
