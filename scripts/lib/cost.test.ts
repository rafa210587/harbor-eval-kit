import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkCostGuard, estimateCompareCost, readCostHistory } from "./cost.ts";

/** Writes a job dir shaped exactly like jobName() produces, with a harbor-style result.json. */
function job(root: string, name: string, costUsd: number | null, trials: number) {
  mkdirSync(join(root, name), { recursive: true });
  writeFileSync(
    join(root, name, "result.json"),
    JSON.stringify({ n_total_trials: trials, finished_at: "2026-01-01", stats: { cost_usd: costUsd } })
  );
}

function withJobsDir(fn: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "hek-cost-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("histórico de custo", () => {
  test("lê agent e model do nome do job e ignora job sem custo reportado", () => {
    withJobsDir((dir) => {
      job(dir, "cmp__agent-mini-swe-agent__model-deepseek-deepseek-v4-flash__skill-none", 0.004, 2);
      // Adapter que não reporta custo: é DESCONHECIDO, não gratuito. Entrar como 0 na média
      // subestimaria toda run futura.
      job(dir, "cmp__agent-claude-code__model-anthropic-claude-opus-5__skill-none", null, 1);
      job(dir, "cmp__agent-oracle__skill-none", 0, 1);

      const h = readCostHistory(dir);
      assert.equal(h.length, 1);
      assert.equal(h[0].agent, "mini-swe-agent");
      assert.equal(h[0].model, "deepseek-deepseek-v4-flash");
      assert.equal(h[0].trials, 2);
    });
  });

  test("ignora job ainda sem result.json ou com json quebrado", () => {
    withJobsDir((dir) => {
      mkdirSync(join(dir, "cmp__agent-x__skill-none"), { recursive: true });
      mkdirSync(join(dir, "cmp__agent-y__skill-none"), { recursive: true });
      writeFileSync(join(dir, "cmp__agent-y__skill-none", "result.json"), "{ metade escrita");
      assert.deepEqual(readCostHistory(dir), []);
    });
  });
});

describe("estimativa", () => {
  test("usa o custo por trial do par agent+model e multiplica por n-attempts", () => {
    withJobsDir((dir) => {
      job(dir, "cmp__agent-mini-swe-agent__model-deepseek-flash__skill-none", 0.006, 3); // $0.002/trial
      const e = estimateCompareCost(dir, [{ agent: "mini-swe-agent", model: "deepseek-flash" }], 5);
      assert.equal(e.rows[0].perTrialUsd, 0.002);
      assert.equal(e.estimateUsd, 0.01);
      assert.equal(e.totalTrials, 5);
    });
  });

  test("sem histórico do par, cai para o mesmo model sob outro agent", () => {
    withJobsDir((dir) => {
      job(dir, "cmp__agent-terminus__model-deepseek-flash__skill-none", 0.004, 2);
      const e = estimateCompareCost(dir, [{ agent: "aider", model: "deepseek-flash" }], 1);
      assert.equal(e.rows[0].perTrialUsd, 0.002);
      assert.equal(e.unknown.length, 0);
    });
  });

  test("model nunca rodado entra como desconhecido, e a estimativa vira um PISO", () => {
    withJobsDir((dir) => {
      job(dir, "cmp__agent-mini-swe-agent__model-deepseek-flash__skill-none", 0.002, 1);
      const e = estimateCompareCost(
        dir,
        [{ agent: "mini-swe-agent", model: "deepseek-flash" }, { agent: "claude-code", model: "opus-5" }],
        1
      );
      assert.equal(e.estimateUsd, 0.002, "só soma o que dá pra estimar");
      assert.deepEqual(e.unknown, ["claude-code + opus-5"]);
    });
  });

  test("oracle e nop custam zero por definição, sem precisar de histórico", () => {
    withJobsDir((dir) => {
      const e = estimateCompareCost(dir, [{ agent: "oracle", model: "(default)" }], 50);
      assert.equal(e.estimateUsd, 0);
      assert.deepEqual(e.unknown, []);
    });
  });

  test("sem histórico nenhum a estimativa é null, não zero", () => {
    withJobsDir((dir) => {
      // Zero significaria "de graça" e liberaria o teto. Null significa "não sei".
      const e = estimateCompareCost(dir, [{ agent: "mini-swe-agent", model: "novo" }], 3);
      assert.equal(e.estimateUsd, null);
    });
  });
});

describe("guarda de gasto", () => {
  const est = (v: number | null) => ({ estimateUsd: v, rows: [], unknown: [], totalTrials: 1 });

  test("bloqueia quando a estimativa passa do teto", () => {
    const v = checkCostGuard(est(1.5), 1.0, false);
    assert.equal(v.allowed, false);
    assert.match(v.reason ?? "", /teto/);
  });

  test("libera quando cabe no teto", () => {
    assert.equal(checkCostGuard(est(0.5), 1.0, false).allowed, true);
  });

  test("confirmação explícita libera aquela run", () => {
    assert.equal(checkCostGuard(est(9.0), 1.0, true).allowed, true);
  });

  test("teto ausente ou zero não bloqueia nada", () => {
    assert.equal(checkCostGuard(est(999), null, false).allowed, true);
    assert.equal(checkCostGuard(est(999), 0, false).allowed, true);
  });

  const semHistorico = (trials: number) => ({
    estimateUsd: null,
    rows: [{ agent: "mini-swe-agent", model: "novo", perTrialUsd: null, samples: 0, estimateUsd: null }],
    unknown: ["mini-swe-agent + novo"],
    totalTrials: trials,
  });

  test("estimativa desconhecida em volume pequeno NÃO bloqueia", () => {
    // Bloquear por ignorância impediria a primeira run de qualquer model novo, e ensinaria o
    // usuário a levantar o teto de vez -- que é como uma guarda deixa de proteger.
    assert.equal(checkCostGuard(semHistorico(1), 0.01, false).allowed, true);
  });

  test("estimativa desconhecida em VOLUME bloqueia", () => {
    // O buraco que só apareceu testando de verdade: sem histórico + n-attempts=30 liberava 30
    // runs pagas às cegas -- exatamente o acidente que a guarda existe pra impedir. Não saber o
    // preço não é motivo pra pular a checagem; é motivo pra limitar o VOLUME.
    const v = checkCostGuard(semHistorico(30), null, false);
    assert.equal(v.allowed, false);
    assert.match(v.reason ?? "", /30 trials pagos/);
  });

  test("volume alto de agent gratuito não bloqueia", () => {
    // 50 trials de oracle continuam custando zero -- limitar isso seria atrito sem proteção.
    const soOracle = {
      estimateUsd: 0,
      rows: [{ agent: "oracle", model: "(default)", perTrialUsd: 0, samples: 0, estimateUsd: 0 }],
      unknown: [],
      totalTrials: 50,
    };
    assert.equal(checkCostGuard(soOracle, 0.01, false).allowed, true);
  });

  test("confirmação explícita libera também o caso de volume às cegas", () => {
    assert.equal(checkCostGuard(semHistorico(30), null, true).allowed, true);
  });
});
