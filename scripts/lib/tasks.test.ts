import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getTaskRubricDefault, setTaskRubricDefault, scanTaskTree } from "./tasks.ts";
import { downloadedTasks } from "../../gui/app/dataset-domain.js";

test("dataset discovery finds nested task roots without inventing environment/test tasks", () => {
  const root = mkdtempSync(join(tmpdir(), "hek-task-tree-"));
  try {
    const task = join(root, "qa", "hello-world", "hello-world");
    mkdirSync(join(task, "environment"), { recursive: true });
    mkdirSync(join(task, "tests"));
    writeFileSync(join(task, "task.toml"), "[task]");
    const stub = join(root, "python", "stub");
    mkdirSync(stub, { recursive: true });
    writeFileSync(join(stub, "instruction.md"), "Fill this task");
    const tasks = scanTaskTree(root, "datasets");
    assert.equal(tasks.length, 2);
    assert.equal(tasks.find(t => t.path === task)?.stub, false);
    assert.equal(tasks.find(t => t.path === stub)?.stub, true);
    assert.deepEqual(downloadedTasks([{ source: "datasets", path: "datasets\\qa\\hello-world\\hello-world" }, { source: "datasets", path: "datasets\\qa-other\\task" }], "datasets/qa"), [{ source: "datasets", path: "datasets\\qa\\hello-world\\hello-world" }]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("dataset discovery never traverses a linked root or linked child", () => {
  const root = mkdtempSync(join(tmpdir(), "hek-task-link-"));
  try {
    const target = join(root, "target"), catalog = join(root, "catalog"), linked = join(root, "linked");
    mkdirSync(target); mkdirSync(catalog);
    writeFileSync(join(target, "task.toml"), "[task]");
    symlinkSync(target, linked, "junction");
    symlinkSync(target, join(catalog, "nested"), "junction");
    assert.deepEqual(scanTaskTree(linked, "datasets"), []);
    assert.deepEqual(scanTaskTree(catalog, "datasets"), []);
    assert.equal(readFileSync(join(target, "task.toml"), "utf8"), "[task]");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

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
