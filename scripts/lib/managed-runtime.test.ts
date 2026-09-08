import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { managedRunArgs, managedRuntimeEnv, MANAGED_ENVIRONMENT } from "./managed-runtime.ts";

test("local runs select the managed extension and cannot select a cloud backend", () => {
  assert.deepEqual(managedRunArgs(["--version"]), ["--version"]);
  assert.deepEqual(managedRunArgs(["run", "--env", "docker"]), ["run", "--env", MANAGED_ENVIRONMENT]);
  assert.deepEqual(managedRunArgs(["run"]), ["run", "--env", MANAGED_ENVIRONMENT]);
  assert.throws(() => managedRunArgs(["run", "--env=ec2"]), /não estão habilitados/);
  assert.throws(() => managedRunArgs(["run", "--env=docker", "-e", "docker"]), /duplicado/);
  assert.deepEqual(managedRunArgs(["analyze", "job"]), ["analyze", "job", "--env", "docker"]);
  assert.throws(() => managedRunArgs(["analyze", "job", "--env=ec2"]), /não estão habilitados/);
  assert.throws(() => managedRunArgs(["run", "-eec2"]), /não estão habilitados/);
  assert.throws(() => managedRunArgs(["run", "-e=ec2"]), /não estão habilitados/);
  assert.deepEqual(managedRunArgs(["run", "-edocker"]), ["run", "--env", MANAGED_ENVIRONMENT]);
});

test("dry run never creates a manifest; real runtime snapshots before child execution", () => {
  const root = mkdtempSync(join(tmpdir(), "harbor-eval-kit-runtime-"));
  const before = process.env.HARBOR_EVAL_MANIFEST;
  const manifest = join(root, "installation-manifest.json");
  process.env.HARBOR_EVAL_MANIFEST = manifest;
  try {
    const env = managedRuntimeEnv(["run", "--print-config"], { TEST_KEY: "synthetic" });
    assert.equal(existsSync(manifest), false);
    assert.equal(env.TEST_KEY, "synthetic");
    assert.equal(env.HARBOR_EVAL_MANIFEST, manifest);
    managedRuntimeEnv(["run"]);
    assert.equal(JSON.parse(readFileSync(manifest, "utf8")).schema_version, 1);
    const modified = statSync(manifest).mtimeMs;
    managedRuntimeEnv(["run"]);
    assert.equal(statSync(manifest).mtimeMs, modified, "existing manifest is read-only during run startup");
    assert.equal(managedRuntimeEnv(["analyze", "job"]).HARBOR_EVAL_MANIFEST, manifest);
    assert.equal(statSync(manifest).mtimeMs, modified, "Analyze also preserves the live manifest");
  } finally {
    if (before === undefined) delete process.env.HARBOR_EVAL_MANIFEST; else process.env.HARBOR_EVAL_MANIFEST = before;
    rmSync(root, { recursive: true, force: true });
  }
});
