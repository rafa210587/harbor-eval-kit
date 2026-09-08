import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { discoverCleanupResources, executeCleanup, planCleanup } from './cleanup.ts';
import type { CleanupExecutor } from './cleanup.ts';
import { loadInstallationManifest, saveInstallationManifest } from './installation.ts';

/** Primitive smoke only: does not declare Harbor/Docker compatibility or READY. */
export function smokePodman(manifestPath: string, run: CleanupExecutor): void {
  const manifest = loadInstallationManifest(manifestPath);
  run('podman', ['info']);
  const prefix = `harbor-eval-kit-doctor-${randomUUID()}`;
  const names = { containers: `${prefix}-container`, images: `${prefix}-image`, volumes: `${prefix}-volume`, networks: `${prefix}-network` };
  const existing = discoverCleanupResources(run);
  if (!existing.some(resource => resource.kind === 'images' && resource.names.includes('docker.io/library/alpine:3.20'))) throw new Error('Smoke requires a preexisting docker.io/library/alpine:3.20 image; provision the base image explicitly before doctor. The kit will not pull an unowned image.');
  if (existing.some(resource => resource.names.some(name => Object.values(names).includes(name.replace(/^localhost\//, '').replace(/:latest$/, ''))))) throw new Error('Smoke resource name collision');
  // Record intent before creation: interrupted/failed smoke resources remain identifiable.
  for (const [kind, name] of Object.entries(names)) manifest.managed_resources[kind].push(name);
  saveInstallationManifest(manifestPath, manifest);
  const temp = mkdtempSync(join(tmpdir(), 'harbor-eval-kit-doctor-'));
  try {
    const bind = join(temp, 'bind');
    mkdirSync(bind);
    writeFileSync(join(bind, 'host-seed'), 'host-ok\n');
    writeFileSync(join(temp, 'Containerfile'), 'FROM docker.io/library/alpine:3.20\nRUN echo ok >/image-ok\nCMD ["sh","-lc","sleep 60"]\nLABEL io.harbor-eval-kit.managed="true"\n');
    run('podman', ['build', '--pull=never', '-t', names.images, temp]);
    const label = 'io.harbor-eval-kit.managed=true';
    run('podman', ['volume', 'create', '--label', label, names.volumes]);
    run('podman', ['network', 'create', '--label', label, names.networks]);
    run('podman', ['run', '-d', '--name', names.containers, '--label', label, '--network', names.networks, '-e', 'HARBOR_EVAL_SMOKE_MARKER=synthetic-ok', '-v', `${names.volumes}:/managed`, '-v', `${bind}:/host-bind`, names.images]);
    run('podman', ['exec', names.containers, 'test', '-f', '/image-ok']);
    run('podman', ['exec', names.containers, 'sh', '-lc', 'test "$HARBOR_EVAL_SMOKE_MARKER" = synthetic-ok']);
    run('podman', ['exec', names.containers, 'sh', '-lc', 'test "$(cat /host-bind/host-seed)" = host-ok']);
    run('podman', ['exec', names.containers, 'sh', '-lc', 'echo container-ok >/host-bind/container-write']);
    if (readFileSync(join(bind, 'container-write'), 'utf8').trim() !== 'container-ok') {
      throw new Error('Podman bind mount did not persist a container write on the host');
    }
    run('podman', ['exec', names.containers, 'sh', '-lc', 'echo ok >/managed/volume-ok']);
    run('podman', ['exec', names.containers, 'test', '-f', '/managed/volume-ok']);
    const owned = discoverCleanupResources(run).filter(resource => resource.names.some(name => name.includes(prefix)));
    if (owned.length !== 4) throw new Error('Smoke resources not fully observable; leaving them for audited cleanup');
    // Image inspection returns localhost/name:latest; record that exact alias before planning.
    for (const resource of owned) manifest.managed_resources[resource.kind].push(resource.id);
    saveInstallationManifest(manifestPath, manifest);
    const resourceManifest = { ...manifest, installed_by_kit: {} };
    const plan = planCleanup(resourceManifest, owned);
    executeCleanup(manifestPath, plan, (command, args) => {
      const result = run(command, args);
      if (discoverCleanupResources(run).some(resource => resource.kind === owned.find(item => item.id === args.at(-1))?.kind && resource.id === args.at(-1))) throw new Error('Smoke cleanup resource still present');
      return result;
    });
  } finally {
    if (realpathSync(dirname(temp)) !== realpathSync(tmpdir())) throw new Error('Temporary directory escaped expected parent');
    rmSync(temp, { recursive: true, force: true });
  }
}
