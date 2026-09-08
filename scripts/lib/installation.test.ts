import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { snapshotInstallation, markInstalledDependency, loadInstallationManifest } from './installation.ts';
import { smokePodman } from './podman-smoke.ts';

test('snapshot survives reruns, only newly installed dependencies can be claimed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'harbor-install-test-'));
  try {
    const path = join(dir, 'manifest.json');
    snapshotInstallation(path, tool => tool === 'podman' ? '/preexisting/podman' : undefined);
    const first = readFileSync(path, 'utf8');
    snapshotInstallation(path, () => '/now/present');
    assert.equal(readFileSync(path, 'utf8'), first);
    assert.throws(() => markInstalledDependency(path, 'harbor', () => undefined), /not found/);
    markInstalledDependency(path, 'harbor', () => '/kit/harbor');
    assert.equal(loadInstallationManifest(path).installed_by_kit.harbor.path, '/kit/harbor');
    assert.equal(loadInstallationManifest(path).preexisting.harbor.present, false);
    writeFileSync(path, '{}');
    assert.throws(() => snapshotInstallation(path), /Invalid/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('smoke creates uniquely named labeled resources, records before mutation and removes only its resources', () => {
  const dir = mkdtempSync(join(tmpdir(), 'harbor-install-test-'));
  try {
    const path = join(dir, 'manifest.json');
    snapshotInstallation(path, () => undefined);
    const resources: any[] = [{ kind: 'container', id: 'unrelated', name: 'preexisting', labels: {} }, { kind: 'image', id: 'base', name: 'docker.io/library/alpine:3.20', labels: {} }];
    let bindDir = '';
    smokePodman(path, (_command, args) => {
      const label = { 'io.harbor-eval-kit.managed': 'true' };
      if (args[0] === 'info') return '';
      if (args[0] === 'exec') {
        if (args.includes('echo container-ok >/host-bind/container-write')) {
          writeFileSync(join(bindDir, 'container-write'), 'container-ok\n');
        }
        return '';
      }
      if (args[0] === 'ps') return resources.filter(r => r.kind === 'container').map(r => r.id).join('\n');
      if (args[0] === 'images') return resources.filter(r => r.kind === 'image').map(r => r.id).join('\n');
      if (args[1] === 'ls') return resources.filter(r => r.kind === args[0]).map(r => r.id).join('\n');
      if (args[1] === 'inspect') {
        const r = resources.find(r => r.id === args[2]);
        return JSON.stringify([{ Name: r.name, RepoTags: [r.name], Labels: r.labels }]);
      }
      if (args[0] === 'build' || args[0] === 'run' || args[1] === 'create') {
        const kind = args[0] === 'build' ? 'image' : args[0] === 'run' ? 'container' : args[0];
        const name = args[0] === 'build'
          ? args[args.indexOf('-t') + 1]
          : args[0] === 'run'
            ? args[args.indexOf('--name') + 1]
            : args.at(-1)!;
        assert.ok(name.startsWith('harbor-eval-kit-doctor-'));
        assert.ok(loadInstallationManifest(path).managed_resources[`${kind}s`].includes(name));
        if (kind !== 'image') assert.ok(args.includes('io.harbor-eval-kit.managed=true'));
        if (args[0] === 'run') {
          assert.ok(args.includes('HARBOR_EVAL_SMOKE_MARKER=synthetic-ok'));
          const mount = args.find(arg => arg.endsWith(':/host-bind'))!;
          bindDir = mount.slice(0, -':/host-bind'.length);
          assert.equal(readFileSync(join(bindDir, 'host-seed'), 'utf8'), 'host-ok\n');
        }
        resources.push({ kind, name, id: name, labels: label });
        return name;
      }
      if (args[0] === 'rm' || args[0] === 'rmi' || args[1] === 'rm') {
        assert.notEqual(args.at(-1), 'unrelated');
        resources.splice(resources.findIndex(r => r.id === args.at(-1)), 1);
        return '';
      }
      throw new Error(`Unexpected fake invocation: ${args.join(' ')}`);
    });
    assert.deepEqual(resources.map(r => r.id), ['unrelated', 'base']);
    assert.equal(loadInstallationManifest(path).uninstall_audit[0].status, 'complete');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('failed smoke retains ownership reservation and never deletes a preexisting resource', () => {
  const dir = mkdtempSync(join(tmpdir(), 'harbor-install-test-'));
  try {
    const path = join(dir, 'manifest.json');
    snapshotInstallation(path, () => undefined);
    const removals: string[][] = [];
    assert.throws(() => smokePodman(path, (_command, args) => {
      if (args.includes('rm') || args.includes('rmi')) removals.push(args);
      if (args[0] === 'images') return 'base';
      if (args[1] === 'inspect') return JSON.stringify([{ RepoTags: ['docker.io/library/alpine:3.20'], Labels: {} }]);
      if (args[0] === 'build') throw new Error('build failure');
      return '';
    }), /build failure/);
    assert.deepEqual(removals, []);
    assert.equal(loadInstallationManifest(path).managed_resources.images.length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
