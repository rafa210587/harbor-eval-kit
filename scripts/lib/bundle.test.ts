import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { exportConfigBundle, importConfigBundle, BUNDLE_REGISTRIES } from "./bundle.ts";
import { readRegistry, writeRegistry } from "./paths.ts";

/** Isolates each test in its own state dir, exactly like a real per-machine ~/.harbor-eval-kit. */
function withStateDir(fn: () => void) {
  const dir = mkdtempSync(join(tmpdir(), "hek-bundle-"));
  const prev = process.env.HARBOR_EVAL_STATE_DIR;
  process.env.HARBOR_EVAL_STATE_DIR = dir;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.HARBOR_EVAL_STATE_DIR;
    else process.env.HARBOR_EVAL_STATE_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("exportConfigBundle", () => {
  test("carrega todas as registries listadas, mesmo vazias", () => {
    withStateDir(() => {
      const b = exportConfigBundle();
      assert.equal(b.version, 1);
      for (const name of BUNDLE_REGISTRIES) assert.deepEqual(b.registries[name], []);
    });
  });

  test("nunca inclui nada parecido com secret", () => {
    withStateDir(() => {
      writeRegistry("models", [{ id: "m1", label: "Sonnet", value: "anthropic/claude-sonnet-5" }]);
      const b = exportConfigBundle();
      const json = JSON.stringify(b);
      // Um Model é label + "provider/modelo", nunca uma chave -- confirma que o formato em si
      // não carrega segredo, e que nenhum outro campo os introduziu por acidente.
      assert.ok(!/sk-|API_KEY.*=|secrets\.env/i.test(json));
    });
  });
});

describe("importConfigBundle", () => {
  test("insere itens novos por id", () => {
    withStateDir(() => {
      const bundle = { version: 1 as const, exportedAt: "x", registries: { criteria: [{ id: "c1", name: "clean" }] } };
      const summary = importConfigBundle(bundle);
      assert.equal(summary.added, 1);
      assert.equal(summary.updated, 0);
      assert.deepEqual(readRegistry("criteria"), [{ id: "c1", name: "clean" }]);
    });
  });

  test("é idempotente -- importar o mesmo bundle duas vezes não duplica", () => {
    withStateDir(() => {
      const bundle = { version: 1 as const, exportedAt: "x", registries: { criteria: [{ id: "c1", name: "clean" }] } };
      importConfigBundle(bundle);
      const second = importConfigBundle(bundle);
      assert.equal(second.added, 0);
      assert.equal(second.updated, 1);
      assert.equal(readRegistry("criteria").length, 1);
    });
  });

  test("upsert por id atualiza sem apagar outros itens locais", () => {
    withStateDir(() => {
      writeRegistry("criteria", [
        { id: "local-1", name: "so_existe_aqui" },
        { id: "c1", name: "versao_velha" },
      ]);
      const bundle = { version: 1 as const, exportedAt: "x", registries: { criteria: [{ id: "c1", name: "versao_nova" }] } };
      const summary = importConfigBundle(bundle);
      assert.equal(summary.updated, 1);
      const after = readRegistry<{ id: string; name: string }>("criteria");
      assert.equal(after.length, 2, "o item só local não pode sumir");
      assert.ok(after.some((c) => c.id === "local-1" && c.name === "so_existe_aqui"));
      assert.ok(after.some((c) => c.id === "c1" && c.name === "versao_nova"));
    });
  });

  test("registro desconhecido é ignorado, não rejeita o bundle inteiro", () => {
    withStateDir(() => {
      const bundle = {
        version: 1 as const,
        exportedAt: "x",
        registries: { criteria: [{ id: "c1", name: "ok" }], algo_futuro: [{ id: "x" }] },
      };
      const summary = importConfigBundle(bundle);
      assert.equal(summary.added, 1);
      assert.ok(summary.warnings.some((w) => w.includes("algo_futuro")));
    });
  });

  test("bundle sem 'registries' não quebra, só avisa", () => {
    withStateDir(() => {
      const summary = importConfigBundle({ oops: true });
      assert.equal(summary.added, 0);
      assert.ok(summary.warnings.length > 0);
    });
  });

  test("item sem id é ignorado com aviso, o resto do registro segue importando", () => {
    withStateDir(() => {
      const bundle = {
        version: 1 as const,
        exportedAt: "x",
        registries: { criteria: [{ name: "sem_id" }, { id: "c2", name: "com_id" }] },
      };
      const summary = importConfigBundle(bundle);
      assert.equal(summary.added, 1);
      assert.ok(summary.warnings.some((w) => w.includes("sem id")));
    });
  });

  test("round-trip: exportar e reimportar reproduz o estado exatamente", () => {
    withStateDir(() => {
      writeRegistry("agents", [{ id: "a1", label: "Oracle", agentValue: "oracle" }]);
      writeRegistry("models", [{ id: "m1", label: "Sonnet", value: "anthropic/claude-sonnet-5" }]);
      const bundle = exportConfigBundle();

      // Simula outra máquina: registries vazias antes de importar.
      writeRegistry("agents", []);
      writeRegistry("models", []);
      importConfigBundle(bundle);

      assert.deepEqual(readRegistry("agents"), [{ id: "a1", label: "Oracle", agentValue: "oracle" }]);
      assert.deepEqual(readRegistry("models"), [{ id: "m1", label: "Sonnet", value: "anthropic/claude-sonnet-5" }]);
    });
  });
});
