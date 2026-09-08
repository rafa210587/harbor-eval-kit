import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importConfigBundle } from "./bundle.ts";
import { readRegistry, writeRegistry } from "./paths.ts";
import { resolveRubricPath, resolveJudgePromptPath } from "./materialize.ts";
import { createExperimentPlan } from "./experiment-plan.ts";
import { prepareExperiment, experimentDirectory } from "./experiment-store.ts";
import type { SkillEntry } from "./types.ts";
import { assertSafeId, validateRegistryEntry } from "./registry-validation.ts";
function isolated(fn: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "hek-validation-"));
  const old = process.env.HARBOR_EVAL_STATE_DIR;
  process.env.HARBOR_EVAL_STATE_DIR = join(dir, "state");
  try { fn(dir); } finally {
    if (old === undefined) delete process.env.HARBOR_EVAL_STATE_DIR; else process.env.HARBOR_EVAL_STATE_DIR = old;
    rmSync(dir, { recursive: true, force: true });
  }
}
const skill = { id: "safe", label: "Skill", mode: "authored" as const, instructions: "original" };
function snapshotSkill(dir: string, item: SkillEntry) {
  const task = join(dir, "task"); mkdirSync(task, { recursive: true });
  writeFileSync(join(task, "task.toml"), "[task]");
  const plan = createExperimentPlan({ path: task, jobsDir: join(dir, "jobs") }, [{ agent: "oracle", model: null, label: "Oracle", skillset: { label: "test", paths: [] }, skills: [item] }]);
  return prepareExperiment(plan);
}
test("IDs reject traversal, alternate streams and type confusion", () => {
  for (const id of ["../x", "a/../../x", "a\\x", "a:stream", "", 4, null, "a."]) assert.throws(() => assertSafeId(id));
  assert.doesNotThrow(() => assertSafeId("legacy-id_12"));
});
test("all imported schemas and references validated before first write", () => isolated(() => {
  writeRegistry("models", [{ id: "old", label: "Old", value: "p/old" }]);
  const attempt = (registries: unknown) => importConfigBundle({ version: 1, registries });
  assert.throws(() => attempt({ models: [{ id: "new", label: "New", value: "p/new" }], skillsets: [{ id: "ss", label: "Set", skillIds: ["missing"] }] }));
  assert.equal(readRegistry("models").length, 1);
  assert.deepEqual(readRegistry("skillsets"), []);
  assert.throws(() => attempt({ models: [{ id: "x", label: "X", value: 42 }] }));
  assert.throws(() => attempt({ skills: [skill, skill] }));
  assert.throws(() => attempt({ criteria: {} }));
  assert.throws(() => importConfigBundle({ version: 2, registries: {} }));
}));
test("bundle references resolve against merged existing and incoming registries", () => isolated(() => {
  writeRegistry("models", [{ id: "old", label: "Old", value: "p/old" }]);
  importConfigBundle({ version: 1, registries: {
    agents: [{ id: "a", label: "A", agentValue: "oracle", modelId: "old", defaultSkillsetIds: ["ss"] }],
    skillsets: [{ id: "ss", label: "Set", skillIds: ["safe"] }], skills: [skill],
  } });
  assert.equal(readRegistry("agents").length, 1);
}));
test("invalid extra files preserve previous snapshot and external data", () => isolated(dir => {
  const previous = snapshotSkill(dir, skill);
  const path = previous.plan.candidates[0].skillset.paths[0];
  const external = join(dir, "keep.txt"); writeFileSync(external, "keep");
  for (const name of ["../keep.txt", "C:/keep.txt", "SKILL.md", "a/../../x", "a:stream", "CON", "a\\b"]) {
    assert.throws(() => snapshotSkill(dir, { ...skill, extraFiles: [{ name, content: "bad" }] }));
    assert.equal(readFileSync(join(path, "SKILL.md"), "utf8"), "original");
  }
  assert.equal(readFileSync(external, "utf8"), "keep");
  assert.throws(() => resolveRubricPath("../bad", []));
  assert.throws(() => resolveJudgePromptPath("../bad", "bad"));
}));
test("junction ancestors cannot redirect registry, judge or experiment writes", () => isolated(dir => {
  const state = join(dir, "state"), outside = join(dir, "outside");
  mkdirSync(state); mkdirSync(outside); writeFileSync(join(outside, "keep.txt"), "keep");
  for (const folder of ["rubrics", "judges", "registries", "jobs"]) {
    const link = join(state, folder);
    symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
    try {
      if (folder === "jobs") assert.throws(() => experimentDirectory(link, "trial"));
      if (folder === "rubrics") assert.throws(() => resolveRubricPath("r", []));
      if (folder === "judges") assert.throws(() => resolveJudgePromptPath("j", "bad"));
      if (folder === "registries") assert.throws(() => writeRegistry("models", []));
      assert.equal(readFileSync(join(outside, "keep.txt"), "utf8"), "keep");
      assert.equal(existsSync(join(outside, "skill-safe")), false);
    } finally { rmSync(link); }
  }
}));

test("successive executed snapshots contain only their selected skill version", () => isolated(dir => {
  const first = snapshotSkill(dir, { ...skill, extraFiles: [{ name: "old.py", content: "v1" }] });
  const second = snapshotSkill(dir, { ...skill, instructions: "edited", extraFiles: [{ name: "new.py", content: "v2" }] });
  const oldPath = first.plan.candidates[0].skillset.paths[0], newPath = second.plan.candidates[0].skillset.paths[0];
  assert.equal(readFileSync(join(oldPath, "old.py"), "utf8"), "v1");
  assert.equal(existsSync(join(newPath, "old.py")), false);
  assert.equal(readFileSync(join(newPath, "new.py"), "utf8"), "v2");
  assert.equal(readFileSync(join(newPath, "SKILL.md"), "utf8"), "edited");
  const external = join(dir, "external"); mkdirSync(external);
  writeFileSync(join(external, "SKILL.md"), "user content");
  const fromPath = snapshotSkill(dir, { ...skill, mode: "path", path: external });
  writeFileSync(join(external, "SKILL.md"), "user edit");
  assert.equal(readFileSync(join(fromPath.plan.candidates[0].skillset.paths[0], "SKILL.md"), "utf8"), "user content");
}));
test("schema rejects unknown fields and conflicting extra-file paths", () => {
  assert.throws(() => validateRegistryEntry("models", { id: "m", label: "M", value: "p/m", credentials: "not-allowed" }));
  assert.throws(() => validateRegistryEntry("skills", { ...skill, extraFiles: [{ name: "a", content: "" }, { name: "a/b", content: "" }] }));
});
test("trusted parent alias is supported but a symlink state root is refused", () => isolated(dir => {
  const actual = join(dir, "actual"), alias = join(dir, "alias");
  mkdirSync(actual);
  symlinkSync(actual, alias, process.platform === "win32" ? "junction" : "dir");
  try {
    process.env.HARBOR_EVAL_STATE_DIR = join(alias, "state");
    writeRegistry("models", []);
    assert.ok(existsSync(join(actual, "state", "registries", "models.json")));
    process.env.HARBOR_EVAL_STATE_DIR = alias;
    assert.throws(() => writeRegistry("models", []));
  } finally { rmSync(alias); }
}));
