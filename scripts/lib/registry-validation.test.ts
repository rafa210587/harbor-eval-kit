import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importConfigBundle } from "./bundle.ts";
import { readRegistry, writeRegistry } from "./paths.ts";
import { resolveSkillPath, resolveRubricPath, resolveJudgePromptPath } from "./materialize.ts";
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
  const path = resolveSkillPath(skill)!;
  const external = join(dir, "keep.txt"); writeFileSync(external, "keep");
  for (const name of ["../keep.txt", "C:/keep.txt", "SKILL.md", "a/../../x", "a:stream", "CON", "a\\b"]) {
    assert.throws(() => resolveSkillPath({ ...skill, extraFiles: [{ name, content: "bad" }] }));
    assert.equal(readFileSync(join(path, "SKILL.md"), "utf8"), "original");
  }
  assert.equal(readFileSync(external, "utf8"), "keep");
  assert.throws(() => resolveRubricPath("../bad", []));
  assert.throws(() => resolveJudgePromptPath("../bad", "bad"));
}));
test("junction ancestors cannot redirect registry or materialization writes", () => isolated(dir => {
  const state = join(dir, "state"), outside = join(dir, "outside");
  mkdirSync(state); mkdirSync(outside); writeFileSync(join(outside, "keep.txt"), "keep");
  for (const folder of ["skills", "rubrics", "judges", "registries"]) {
    const link = join(state, folder);
    symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
    try {
      if (folder === "skills") assert.throws(() => resolveSkillPath(skill));
      if (folder === "rubrics") assert.throws(() => resolveRubricPath("r", []));
      if (folder === "judges") assert.throws(() => resolveJudgePromptPath("j", "bad"));
      if (folder === "registries") assert.throws(() => writeRegistry("models", []));
      assert.equal(readFileSync(join(outside, "keep.txt"), "utf8"), "keep");
      assert.equal(existsSync(join(outside, "skill-safe")), false);
    } finally { rmSync(link); }
  }
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
