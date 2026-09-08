// Registry integrity: malformed files must never be silently replaced.
// Executed skill snapshots are tested in experiment.test.ts and registry-validation.test.ts.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readRegistry, writeRegistry, getRegistryPath } from "./paths.ts";
import { HARBOR_AGENTS, TESTED_HARBOR_VERSION, isTestedHarborVersion } from "./catalog.ts";

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

describe("docs name their canonical sources instead of copying fragile counts", () => {
  test("o README aponta o catálogo único de adapters", () => {
    const readme = readFileSync(join(import.meta.dirname, "..", "..", "README.md"), "utf-8");
    assert.ok(HARBOR_AGENTS.length > 0, "catálogo de adapters não pode estar vazio");
    assert.match(readme, /catálogo `HARBOR_AGENTS` espelha os adapters registrados/);
  });

  test("o README aponta o checklist histórico sem duplicar sua contagem", () => {
    const root = join(import.meta.dirname, "..", "..");
    const plan = readFileSync(join(root, "docs", "PLANO_TESTES_UI.md"), "utf-8");
    const readme = readFileSync(join(root, "README.md"), "utf-8");
    const real = (plan.match(/^### T[0-9X]+\.[0-9]+/gm) ?? []).length;
    assert.ok(real > 0, "plano precisa manter cenários identificáveis");
    assert.match(readme, /Plano de testes da UI/);
  });
});
