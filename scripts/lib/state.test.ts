// Tests for the two data-integrity guarantees the state layer has to make: a materialized
// skill directory is an exact snapshot of the skill, and a registry file is never silently
// replaced by an empty one.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readRegistry, writeRegistry, getRegistryPath } from "./paths.ts";
import { TESTED_HARBOR_VERSION, isTestedHarborVersion } from "./catalog.ts";
import { resolveSkillPath } from "./materialize.ts";
import type { SkillEntry } from "./types.ts";

/** Isolates each test in its own state dir, exactly like a real per-machine ~/.harbor-eval-kit. */
function withStateDir(fn: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "hek-state-"));
  const prev = process.env.HARBOR_EVAL_STATE_DIR;
  process.env.HARBOR_EVAL_STATE_DIR = dir;
  try {
    fn(dir);
  } finally {
    if (prev === undefined) delete process.env.HARBOR_EVAL_STATE_DIR;
    else process.env.HARBOR_EVAL_STATE_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  }
}

function authoredSkill(extraFiles: { name: string; content: string }[]): SkillEntry {
  return {
    id: "skill-under-test",
    label: "test",
    mode: "authored",
    instructions: "# instructions",
    extraFiles,
  } as SkillEntry;
}

describe("skill materialization is an exact snapshot", () => {
  test("um arquivo extra removido da skill some do disco", () => {
    withStateDir(() => {
      const dir = resolveSkillPath(
        authoredSkill([
          { name: "examples/java.md", content: "java" },
          { name: "examples/python.md", content: "python" },
        ])
      )!;
      assert.ok(existsSync(join(dir, "examples/java.md")));
      assert.ok(existsSync(join(dir, "examples/python.md")));

      // Same skill, java example removed. Harbor uploads the whole directory, so a leftover
      // file here would still reach the agent and quietly change what the run measures.
      resolveSkillPath(authoredSkill([{ name: "examples/python.md", content: "python" }]));
      assert.equal(existsSync(join(dir, "examples/java.md")), false, "arquivo removido não pode sobrar");
      assert.ok(existsSync(join(dir, "examples/python.md")), "arquivo mantido tem que continuar lá");
      assert.ok(existsSync(join(dir, "SKILL.md")));
    });
  });

  test("renomear um arquivo extra não deixa a cópia antiga", () => {
    withStateDir(() => {
      const dir = resolveSkillPath(authoredSkill([{ name: "old.py", content: "x" }]))!;
      assert.ok(existsSync(join(dir, "old.py")));
      resolveSkillPath(authoredSkill([{ name: "new.py", content: "x" }]));
      assert.equal(existsSync(join(dir, "old.py")), false);
      assert.ok(existsSync(join(dir, "new.py")));
    });
  });

  test("conteúdo atualizado sobrescreve, sem duplicar", () => {
    withStateDir(() => {
      const dir = resolveSkillPath(authoredSkill([{ name: "a.txt", content: "v1" }]))!;
      resolveSkillPath(authoredSkill([{ name: "a.txt", content: "v2" }]));
      assert.equal(readFileSync(join(dir, "a.txt"), "utf-8"), "v2");
      assert.deepEqual(readdirSync(dir).sort(), ["SKILL.md", "a.txt"]);
    });
  });

  test("skill mode:path nunca é materializada (é pasta do usuário, não nossa)", () => {
    withStateDir((state) => {
      const userDir = join(state, "not-managed-by-us");
      mkdirSync(userDir, { recursive: true });
      writeFileSync(join(userDir, "SKILL.md"), "do not touch", "utf-8");
      const resolved = resolveSkillPath({ id: "s", label: "l", mode: "path", path: userDir } as SkillEntry);
      assert.equal(resolved, userDir);
      assert.equal(readFileSync(join(userDir, "SKILL.md"), "utf-8"), "do not touch");
    });
  });
});

describe("registry reads surface corruption instead of erasing it", () => {
  test("arquivo inexistente é estado vazio normal", () => {
    withStateDir(() => {
      assert.deepEqual(readRegistry("agents"), []);
    });
  });

  test("roundtrip normal", () => {
    withStateDir(() => {
      writeRegistry("agents", [{ id: "a1" }]);
      assert.deepEqual(readRegistry("agents"), [{ id: "a1" }]);
    });
  });

  test("JSON corrompido lança em vez de virar lista vazia", () => {
    withStateDir(() => {
      writeRegistry("agents", [{ id: "a1" }, { id: "a2" }]);
      const p = getRegistryPath("agents");
      writeFileSync(p, '[{"id":"a1"},{"id":"a2"', "utf-8"); // truncated, as an interrupted write

      assert.throws(() => readRegistry("agents"), /corrompido/);
      // and the broken file is still there to be repaired, not replaced by []
      assert.ok(readFileSync(p, "utf-8").includes("a1"));
    });
  });

  test("JSON válido mas que não é lista também é recusado", () => {
    withStateDir(() => {
      writeRegistry("models", []); // creates registries/ so the raw write below has a home
      writeFileSync(getRegistryPath("models"), '{"nao":"e uma lista"}', "utf-8");
      assert.throws(() => readRegistry("models"), /não é uma lista/);
    });
  });
});

describe("registry writes are atomic", () => {
  test("não deixa arquivo temporário para trás", () => {
    withStateDir(() => {
      writeRegistry("skills", [{ id: "s1" }]);
      const dir = join(getRegistryPath("skills"), "..");
      assert.equal(readdirSync(dir).filter((f) => f.includes(".tmp")).length, 0);
    });
  });

  test("sobrescrever mantém o conteúdo novo íntegro", () => {
    withStateDir(() => {
      writeRegistry("skills", [{ id: "s1" }, { id: "s2" }]);
      writeRegistry("skills", [{ id: "s3" }]);
      assert.deepEqual(readRegistry("skills"), [{ id: "s3" }]);
    });
  });
});

describe("Harbor compatibility contract", () => {
  test("a versão testada é a que os instaladores pinam", () => {
    // Kept in lockstep on purpose: if this constant moves, the installers have to move with
    // it, otherwise a fresh clone installs a Harbor nobody validated the parsing against.
    const sh = readFileSync(join(import.meta.dirname, "..", "harbor-eval.sh"), "utf-8");
    const ps1 = readFileSync(join(import.meta.dirname, "..", "harbor-eval.ps1"), "utf-8");
    assert.ok(sh.includes(`harbor==${TESTED_HARBOR_VERSION}`), "harbor-eval.sh precisa pinar a versão testada");
    assert.ok(ps1.includes(`harbor==${TESTED_HARBOR_VERSION}`), "harbor-eval.ps1 precisa pinar a versão testada");
  });

  test("só a versão exata conta como testada", () => {
    assert.equal(isTestedHarborVersion(TESTED_HARBOR_VERSION), true);
    assert.equal(isTestedHarborVersion("0.23.0"), false);
    assert.equal(isTestedHarborVersion(null), false);
    assert.equal(isTestedHarborVersion(undefined), false);
    assert.equal(isTestedHarborVersion(""), false);
  });
});
