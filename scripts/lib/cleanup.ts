import { realpathSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { updateInstallationManifest } from './installation.ts';

export const RESOURCE_KINDS = ['containers', 'volumes', 'networks', 'images'] as const;
type Kind = typeof RESOURCE_KINDS[number];
export interface CleanupResource { kind: Kind; id: string; names: string[]; labels: Record<string, string> }
export interface CleanupAction { command: string; args: string[] }
export interface CleanupPlan { actions: CleanupAction[]; preserved: string[] }
export type CleanupExecutor = (command: string, args: string[]) => string;
const PREFIX = 'harbor-eval-kit-';
const LABEL = 'io.harbor-eval-kit.managed';
const fail = (message: string): never => { throw new Error(`Cleanup aborted: ${message}`); };

export function planCleanup(manifest: any, resources: CleanupResource[], harborPath?: string): CleanupPlan {
  if (manifest?.schema_version !== 1 || !manifest.preexisting || !manifest.installed_by_kit ||
      !manifest.managed_resources) fail('missing or unsupported installation manifest');
  const actions: CleanupAction[] = [];
  const preserved: string[] = [];
  for (const kind of RESOURCE_KINDS) {
    const entries = manifest.managed_resources[kind];
    if (!Array.isArray(entries)) fail(`invalid manifest resources: ${kind}`);
    const keys = entries.map((entry: any) => {
      if (typeof entry === 'string' && entry) return entry;
      if (entry && typeof entry.id === 'string' && entry.id) return entry.id;
      if (entry && typeof entry.name === 'string' && entry.name) return entry.name;
      return fail(`invalid ${kind} identity in manifest`);
    });
    for (const resource of resources.filter(r => r.kind === kind)) {
      const names = resource.names.map(name => name.replace(/^\//, '').replace(/^localhost\//, ''));
      const labeled = resource.labels[LABEL] === 'true';
      const prefixed = names.length > 0 && names.every(name => name.startsWith(PREFIX));
      const recorded = keys.some((key: string) => key === resource.id || resource.names.includes(key) || names.includes(key) || (kind === 'images' && names.some(name => name.replace(/:latest$/, '') === key)));
      const related = labeled || names.some(name => name.startsWith(PREFIX)) || recorded;
      if (!related) continue;
      if (!labeled || !prefixed || !recorded) fail(`ambiguous ownership: ${kind} ${resource.id}`);
      const command = kind === 'containers' ? ['rm', '-f'] : kind === 'images' ? ['rmi'] : [kind === 'volumes' ? 'volume' : 'network', 'rm'];
      actions.push({ command: 'podman', args: [...command, resource.id] });
    }
  }
  for (const [tool, detail] of Object.entries(manifest.installed_by_kit) as [string, any][]) {
    if (!detail || detail.installed !== true) continue;
    const before = manifest.preexisting[tool];
    if (!before || typeof before.present !== 'boolean') fail(`missing dependency snapshot: ${tool}`);
    if (before.present || tool === 'podman') { preserved.push(tool); continue; }
    if (tool === 'uv') { preserved.push('uv (installer footprint is not fully recorded; manual removal required)'); continue; }
    if (tool !== 'harbor') fail(`no verified dependency removal strategy: ${tool}`);
    if (!detail.path || !harborPath) fail('Harbor executable ownership cannot be verified');
    if (realpathSync(detail.path) !== realpathSync(harborPath)) fail('Harbor path differs from installation manifest');
    actions.push({ command: 'uv', args: ['tool', 'uninstall', 'harbor'] });
  }
  return { actions, preserved };
}

export function discoverCleanupResources(run: CleanupExecutor): CleanupResource[] {
  const result: CleanupResource[] = [];
  for (const kind of RESOURCE_KINDS) {
    const listArgs = kind === 'containers' ? ['ps', '-aq', '--no-trunc'] : kind === 'images' ? ['images', '-q', '--no-trunc'] : [kind === 'volumes' ? 'volume' : 'network', 'ls', '-q'];
    const ids = [...new Set(run('podman', listArgs).split(/\r?\n/).map(s => s.trim()).filter(Boolean))];
    for (const id of ids) {
      const type = kind === 'containers' ? 'container' : kind === 'images' ? 'image' : kind === 'volumes' ? 'volume' : 'network';
      const inspected = JSON.parse(run('podman', [type, 'inspect', id]));
      if (!Array.isArray(inspected) || inspected.length !== 1) fail(`invalid inspection: ${kind} ${id}`);
      const item = inspected[0];
      const names = kind === 'images' ? item.RepoTags ?? [] : [item.Name ?? item.name];
      if (!names.every((name: unknown) => typeof name === 'string')) fail(`invalid resource names: ${id}`);
      result.push({ kind, id, names, labels: item.Config?.Labels ?? item.Labels ?? item.labels ?? {} });
    }
  }
  return result;
}

/** All validation completes before the first mutation. A failed command stops the plan. */
export function executeCleanup(manifestPath: string, plan: CleanupPlan, run: CleanupExecutor): void {
  const auditId = randomUUID();
  const mutateAudit = (change: (audit: any, manifest: any) => void) => updateInstallationManifest(manifestPath, manifest => {
    manifest.uninstall_audit ??= [];
    let audit = manifest.uninstall_audit.find((entry: any) => entry.id === auditId);
    if (!audit) {
      audit = { id: auditId, started_at: new Date().toISOString(), plan, completed: [], status: 'running' };
      manifest.uninstall_audit.push(audit);
    }
    change(audit, manifest);
  });
  mutateAudit(() => {});
  try {
    for (const action of plan.actions) {
      run(action.command, action.args);
      mutateAudit((audit, manifest) => {
        if (action.command === 'uv' && manifest.installed_by_kit.harbor) manifest.installed_by_kit.harbor.installed = false;
        audit.completed.push(action);
      });
    }
    mutateAudit(audit => { audit.status = 'complete'; });
  } catch (error) {
    mutateAudit(audit => { audit.status = 'failed'; });
    // Do not persist command output: external tools may include environment secrets.
    throw error;
  } finally { mutateAudit(audit => { audit.finished_at = new Date().toISOString(); }); }
}
