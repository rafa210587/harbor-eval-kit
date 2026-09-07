import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stopContainersForJob } from './exec.ts';

test('cancel stops only exact manifest-owned labeled containers and verifies the effect', () => {
  const dir = mkdtempSync(join(tmpdir(), 'harbor-cancel-test-'));
  try {
    const name = 'harbor-eval-kit-trial__env-main-1';
    mkdirSync(join(dir, 'job', 'harbor-eval-kit-trial'), { recursive: true });
    const manifestPath = join(dir, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify({ schema_version: 1, preexisting: {}, installed_by_kit: {}, managed_resources: { containers: ['owned', 'prefix-neighbor'], images: [], volumes: [], networks: [] } }));
    for (const scenario of ['success', 'missing-label', 'no-effect', 'failed-stop']) {
      let active = ['owned', 'prefix-neighbor', 'unrecorded'];
      const calls: string[] = [];
      const result = stopContainersForJob(dir, 'job', { manifestPath, run: (_command, args) => {
        if (args[0] === 'ps') return args.includes('-aq') ? 'owned\nprefix-neighbor\nunrecorded' : active.join('\n');
        if (args[1] === 'inspect') return JSON.stringify([{ Name: args[2] === 'prefix-neighbor' ? `${name}-other` : name, Config: { Labels: scenario === 'missing-label' ? {} : { 'io.harbor-eval-kit.managed': 'true' } } }]);
        if (args[0] === 'stop') {
          calls.push(args.at(-1)!);
          if (scenario === 'failed-stop') throw new Error('stop failure');
          if (scenario === 'success') active = active.filter(id => id !== args.at(-1));
        }
        return '';
      } });
      assert.deepEqual(calls, scenario === 'missing-label' ? [] : ['owned']);
      assert.deepEqual(result, scenario === 'success' ? [name] : []);
      assert.ok(active.includes('prefix-neighbor') && active.includes('unrecorded'));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('cancel rejects traversal and missing manifests before external commands', () => {
  let calls = 0;
  assert.deepEqual(stopContainersForJob(tmpdir(), '../outside', { run: () => { calls++; return ''; } }), []);
  const dir = mkdtempSync(join(tmpdir(), 'harbor-cancel-test-'));
  try {
    mkdirSync(join(dir, 'job'));
    assert.deepEqual(stopContainersForJob(dir, 'job', { manifestPath: join(dir, 'absent.json'), run: () => { calls++; return ''; } }), []);
    assert.equal(calls, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
