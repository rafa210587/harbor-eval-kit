import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendOperationLog, createOperation, operationExecutionUncertain, readOperation, updateOperation } from "./operations.ts";

test("operation state and incremental log persist only scrubbed values", () => {
  const root = mkdtempSync(join(tmpdir(), "hek-operations-"));
  const previous = process.env.HARBOR_EVAL_STATE_DIR;
  process.env.HARBOR_EVAL_STATE_DIR = root;
  const id = "123e4567-e89b-42d3-a456-426614174000", secret = "sëcret-🔑", secrets = { API_KEY: secret };
  try {
    const jobsDir = join(root, "jobs"), harborJob = join(jobsDir, "analysis-job");
    mkdirSync(harborJob, { recursive: true });
    createOperation({ id, type: "analyze", targetPath: `task/${secret}`, jobsDir, harborJobName: "analysis-job" }, secrets);
    appendOperationLog(id, "stdout", "rea", secrets);
    appendOperationLog(id, "stdout", "dy [REDACTED]\n", secrets);
    appendOperationLog(id, "stderr", `fail`, secrets);
    appendOperationLog(id, "stderr", `ure ${secret}\n`, secrets);
    updateOperation(id, { status: "succeeded", finishedAt: "2026-09-07T00:00:00.000Z", result: { output: secret } }, secrets);
    const first = readOperation(id, 0, secrets);
    assert.equal(first.status, "succeeded");
    assert.equal(operationExecutionUncertain(first, new Set()), false);
    assert.equal((first.result as any).output, "[REDACTED]");
    assert.equal(first.log.content, "[stdout] ready [REDACTED]\n\n[stderr] failure [REDACTED]\n");
    assert.equal(first.log.content.match(/\[stdout\]/g)?.length, 1);
    assert.equal(first.log.content.match(/\[stderr\]/g)?.length, 1);
    assert.equal(first.operationStatePath, join(root, "operations", id, "operation.json"));
    assert.equal(first.operationLogPath, join(root, "operations", id, "operation.log"));
    assert.equal(first.hasHarborJob, true);
    assert.ok(!JSON.stringify(first).includes(secret));
    const disk = readFileSync(join(root, "operations", id, "operation.json"), "utf8")
      + readFileSync(join(root, "operations", id, "operation.log"), "utf8");
    assert.ok(!disk.includes(secret));
    const replay = readOperation(id, first.log.nextOffset, secrets);
    assert.equal(replay.log.content, "");
    rmSync(harborJob, { recursive: true });
    assert.equal(readOperation(id, replay.log.nextOffset, secrets).hasHarborJob, false);
    assert.throws(() => createOperation({ id, type: "analyze", targetPath: "x", jobsDir: "jobs" }), /já existe/);
    assert.throws(() => readOperation("../escape", 0), /UUID/);
  } finally {
    if (previous === undefined) delete process.env.HARBOR_EVAL_STATE_DIR;
    else process.env.HARBOR_EVAL_STATE_DIR = previous;
    rmSync(root, { recursive: true, force: true });
  }
});

test("orphaned running operations are uncertain and never inferred from a persisted PID", () => {
  const running = { id: "123e4567-e89b-42d3-a456-426614174001", status: "running" } as any;
  assert.equal(operationExecutionUncertain(running, new Set()), true);
  assert.equal(operationExecutionUncertain(running, new Set([running.id])), false);
  assert.equal(operationExecutionUncertain({ ...running, status: "failed" }, new Set()), false);
});
