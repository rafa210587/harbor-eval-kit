import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getTaskRubricDefault, setTaskRubricDefault } from "./tasks.ts";

test("task defaults preserve corrupt data and replace complete JSON atomically", () => {
  const root = mkdtempSync(join(tmpdir(), "hek-task-defaults-")), prev = process.env.HARBOR_EVAL_STATE_DIR;
  process.env.HARBOR_EVAL_STATE_DIR = root;
  const path = join(root, "task-rubric-defaults.json");
  try {
    setTaskRubricDefault("task-a", { judgeId: "j", rubricIds: ["r"] });
    assert.deepEqual(getTaskRubricDefault("task-a"), { judgeId: "j", rubricIds: ["r"] });
    assert.ok(!readdirSync(root).some(name => name.endsWith(".tmp")));
    writeFileSync(path, '{"task-a":');
    assert.throws(() => setTaskRubricDefault("task-b", { judgeId: "other" }), /corrompidos/);
    assert.equal(readFileSync(path, "utf8"), '{"task-a":');
    assert.throws(() => setTaskRubricDefault("task-b", { judgeId: "../invalid" }), /id inválido/);
  } finally {
    if (prev === undefined) delete process.env.HARBOR_EVAL_STATE_DIR; else process.env.HARBOR_EVAL_STATE_DIR = prev;
    rmSync(root, { recursive: true, force: true });
  }
});
