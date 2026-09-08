import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planCleanup, executeCleanup, discoverCleanupResources } from './cleanup.ts';
import { updateInstallationManifest } from './installation.ts';
const manifest = () => ({ schema_version: 1, preexisting: {}, installed_by_kit: {}, managed_resources: { containers: ['abc'], images: [], volumes: [], networks: [] } });
const resource = () => ({ kind: 'containers' as const, id: 'abc', names: ['harbor-eval-kit-test'], labels: { 'io.harbor-eval-kit.managed': 'true' } });

test('cleanup requires manifest, exact identity, prefix and label', () => {
  assert.throws(() => planCleanup({}, []), /manifest/);
  for (const changed of [{ ...resource(), id: 'other' }, { ...resource(), names: ['unrelated'] }, { ...resource(), labels: {} }]) {
    assert.throws(() => planCleanup(manifest(), [changed]), /ambiguous/);
  }
  assert.deepEqual(planCleanup(manifest(), [resource()]).actions, [{ command: 'podman', args: ['rm', '-f', 'abc'] }]);
});

test('cleanup preserves preexisting dependencies and aborts unsupported removal', () => {
  const m: any = manifest();
  m.preexisting.harbor = { present: true };
  m.installed_by_kit.harbor = { installed: true };
  assert.deepEqual(planCleanup(m, []).preserved, ['harbor']);
  m.preexisting.uv = { present: false };
  m.installed_by_kit.uv = { installed: true };
  assert.ok(planCleanup(m, []).preserved.some(tool => tool.startsWith('uv (')));
  m.preexisting.java = { present: false };
  m.installed_by_kit.java = { installed: true };
  assert.throws(() => planCleanup(m, []), /no verified/);
});

test('dry plan includes Harbor uninstall and execution audits exactly the plan', () => {
  const dir = mkdtempSync(join(tmpdir(), 'harbor-cleanup-test-'));
  try {
    const m: any = manifest();
    const bin = join(dir, 'harbor');
    writeFileSync(bin, 'fake executable');
    m.preexisting.harbor = { present: false };
    m.installed_by_kit.harbor = { installed: true, path: bin };
    const path = join(dir, 'manifest.json');
    writeFileSync(path, JSON.stringify(m));
    const calls: any[] = [];
    const plan = planCleanup(m, [resource()], bin);
    assert.equal(calls.length, 0);
    assert.deepEqual(plan.actions[1], { command: 'uv', args: ['tool', 'uninstall', 'harbor'] });
    executeCleanup(path, plan, (command, args) => { calls.push({ command, args }); return ''; });
    assert.deepEqual(calls, plan.actions);
    const persisted = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(persisted.uninstall_audit[0].status, 'complete');
    assert.deepEqual(persisted.preexisting, m.preexisting);
    assert.equal(persisted.installed_by_kit.harbor.installed, false);
    assert.deepEqual(planCleanup(persisted, []).actions, []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('cleanup failures stop subsequent deletion and retain partial audit without output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'harbor-cleanup-test-'));
  try {
    const path = join(dir, 'manifest.json');
    writeFileSync(path, JSON.stringify(manifest()));
    let count = 0;
    const plan = { actions: [{ command: 'podman', args: ['rm', 'abc'] }, { command: 'podman', args: ['rmi', 'xyz'] }], preserved: [] };
    assert.throws(() => executeCleanup(path, plan, () => { count++; throw new Error('external-private-output'); }));
    assert.equal(count, 1);
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).uninstall_audit[0].status, 'failed');
    assert.ok(!readFileSync(path, 'utf8').includes('external-private-output'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('cleanup audit updates preserve a concurrent runtime reservation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'harbor-cleanup-test-'));
  try {
    const path = join(dir, 'manifest.json');
    writeFileSync(path, JSON.stringify(manifest()));
    executeCleanup(path, { actions: [{ command: 'podman', args: ['rm', 'abc'] }], preserved: [] }, () => {
      updateInstallationManifest(path, value => value.managed_resources.networks.push('harbor-eval-kit-late'));
      return '';
    });
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')).managed_resources.networks, ['harbor-eval-kit-late']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('discovery inspects all resource types and never executes removal', () => {
  const calls: string[][] = [];
  const resources = discoverCleanupResources((_command, args) => {
    calls.push(args);
    if (args[0] === 'ps') return 'abc\n';
    if (args[1] === 'inspect') return JSON.stringify([{ Name: '/harbor-eval-kit-test', Config: { Labels: resource().labels } }]);
    return '';
  });
  assert.deepEqual(resources, [{ ...resource(), names: ['/harbor-eval-kit-test'] }]);
  assert.ok(calls.every(args => !args.includes('rm') && !args.includes('rmi')));
});
