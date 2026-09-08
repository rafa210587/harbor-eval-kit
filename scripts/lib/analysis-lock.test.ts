import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { withAnalysisTarget } from "./analysis-lock.ts";

test("duplicate and overlapping analysis requests cannot spend or overwrite concurrently", async () => {
  const root = mkdtempSync(join(tmpdir(), "hek-analysis-lock-")), trial = join(root, "trial");
  mkdirSync(trial);
  let release!: () => void, calls = 0;
  const wait = new Promise<void>(done => { release = done; });
  try {
    const first = withAnalysisTarget(root, async () => { calls++; await wait; throw new Error("provider failure"); });
    await assert.rejects(withAnalysisTarget(trial, async () => { calls++; }), /análise ativa/);
    await assert.rejects(withAnalysisTarget(root, async () => { calls++; }), /análise ativa/);
    assert.equal(calls, 1);
    release();
    await assert.rejects(first, /provider failure/);
    await withAnalysisTarget(trial, async () => { calls++; });
    assert.equal(calls, 2);
  } finally { release(); rmSync(root, { recursive: true, force: true }); }
});
