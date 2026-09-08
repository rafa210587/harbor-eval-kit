import { execFileSync } from 'node:child_process';
import { snapshotInstallation, markInstalledDependency } from './lib/installation.ts';
import { smokePodman } from './lib/podman-smoke.ts';
import { resolvePodmanConnection, validatePodmanInterfaces } from './lib/podman.ts';
const [command, manifest, tool] = process.argv.slice(2);
if (!manifest) throw new Error('Usage: installation.ts snapshot|mark|gate|smoke MANIFEST [harbor|uv]');
if ((process.env.HARBOR_EVAL_PREFIX && process.env.HARBOR_EVAL_PREFIX !== 'harbor-eval-kit-') || (process.env.HARBOR_EVAL_LABEL && process.env.HARBOR_EVAL_LABEL !== 'io.harbor-eval-kit.managed=true')) throw new Error('Custom ownership markers are unsupported');
if (command === 'snapshot') snapshotInstallation(manifest);
else if (command === 'mark') markInstalledDependency(manifest, tool);
else if (command === 'gate') {
  const resolved = resolvePodmanConnection();
  await validatePodmanInterfaces(resolved);
  console.log(JSON.stringify(resolved, null, 2));
}
else if (command === 'smoke') smokePodman(manifest, (bin, args) => execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
else throw new Error('Unknown installation operation');
