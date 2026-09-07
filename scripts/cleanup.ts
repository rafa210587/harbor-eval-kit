import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { delimiter, join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { discoverCleanupResources, executeCleanup, planCleanup } from './lib/cleanup.ts';

const args = process.argv.slice(2);
if (args.some(arg => arg !== '--dry-run' && !arg.startsWith('--manifest='))) throw new Error('Usage: cleanup.ts [--dry-run] [--manifest=path]');
if ((process.env.HARBOR_EVAL_PREFIX && process.env.HARBOR_EVAL_PREFIX !== 'harbor-eval-kit-') ||
    (process.env.HARBOR_EVAL_LABEL && process.env.HARBOR_EVAL_LABEL !== 'io.harbor-eval-kit.managed=true')) throw new Error('Custom ownership markers are not supported for cleanup');
const manifestPath = args.find(arg => arg.startsWith('--manifest='))?.slice(11) ?? process.env.HARBOR_EVAL_MANIFEST ?? join(process.env.HARBOR_EVAL_STATE_DIR ?? join(homedir(), '.harbor-eval-kit'), 'installation-manifest.json');
// Missing/invalid manifest fails before contacting Podman.
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.schema_version !== 1 || !manifest.managed_resources || !manifest.preexisting || !manifest.installed_by_kit) throw new Error('Invalid installation manifest');
const executable = process.platform === 'win32' ? 'harbor.exe' : 'harbor';
const harborPath = (process.env.PATH ?? '').split(delimiter).map(dir => join(dir, executable)).find(path => existsSync(path));
const run = (command: string, commandArgs: string[]) => execFileSync(command, commandArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const plan = planCleanup(manifest, discoverCleanupResources(run), harborPath);
if (plan.actions.some(action => action.command === 'uv')) {
  const uvBin = run('uv', ['tool', 'dir', '--bin']).trim();
  if (!harborPath || realpathSync(uvBin) !== realpathSync(dirname(harborPath))) throw new Error('Harbor is not owned by the active uv tool directory');
}
console.log(JSON.stringify({ dryRun: args.includes('--dry-run'), manifest: manifestPath, ...plan }, null, 2));
if (!args.includes('--dry-run')) executeCleanup(manifestPath, plan, (command, commandArgs) => {
  const output = run(command, commandArgs);
  if (command === 'podman') {
    const target = commandArgs.at(-1);
    if (discoverCleanupResources(run).some(resource => resource.id === target)) throw new Error('Resource still exists after cleanup');
  } else if (harborPath && existsSync(harborPath)) throw new Error('Harbor executable still exists after uninstall');
  return output;
});
