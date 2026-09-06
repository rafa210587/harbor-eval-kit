// Unit tests for the pure logic in harbor.ts. Run with: node --test scripts/
//
// Scope on purpose: everything here is deterministic and offline. Nothing in this file spawns
// podman, calls a provider, or needs Harbor installed -- those paths are covered by the real
// end-to-end runs documented in docs/COMO_FUNCIONA.md, which cost money and take minutes and
// therefore do not belong in a suite meant to run on every change.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  HARBOR_AGENTS,
  FREE_AGENTS,
  JUDGE_MODELS,
  LITELLM_GATEWAY_DISABLED,
  PROVIDERS,
  buildCombos,
  buildHarborEnv,
  buildHarborRunArgs,
  csvEscape,
  isJudgeModelAllowed,
  jobName,
  listJobLogFiles,
  listJobLogs,
  litellmGatewayEnv,
  parseSkillset,
  resolveRubricCriteria,
  sanitize,
  serializeRubricToml,
  tailJobLog,
} from "./harbor.ts";

// --- fixtures ---------------------------------------------------------------------------

/** Builds a throwaway jobs dir shaped like the one harbor writes, returns its path. */
function makeJobsDir(): string {
  const root = mkdtempSync(join(tmpdir(), "hek-test-"));
  const job = join(root, "cmp__agent-oracle__skill-none");
  mkdirSync(join(job, "trial-1", "verifier"), { recursive: true });
  writeFileSync(join(job, "job.log"), "linha 1\nlinha 2\n");
  writeFileSync(join(job, "result.json"), JSON.stringify({ finished_at: null }));
  writeFileSync(join(job, "trial-1", "trial.log"), "abcdefghij");
  writeFileSync(join(job, "trial-1", "verifier", "reward.txt"), "1");
  return root;
}

// --- sanitize / jobName -----------------------------------------------------------------

describe("sanitize", () => {
  test("troca separadores por hifen, preservando ._-", () => {
    assert.equal(sanitize("deepseek/deepseek-chat"), "deepseek-deepseek-chat");
    assert.equal(sanitize("anthropic/claude-sonnet-5"), "anthropic-claude-sonnet-5");
    assert.equal(sanitize("a b:c"), "a-b-c");
    assert.equal(sanitize("mantem.pontos_e-hifens"), "mantem.pontos_e-hifens");
  });

  test("apara hifens das pontas e nunca devolve string vazia", () => {
    assert.equal(sanitize("///"), "x");
    assert.equal(sanitize(""), "x");
    assert.equal(sanitize("-meio-"), "meio");
  });
});

describe("jobName", () => {
  const combo = { agent: "mini-swe-agent", model: "deepseek/deepseek-chat", skillset: { label: "none", paths: [] } };

  test("compõe prefixo + agent + model + skillset", () => {
    // Este é o formato que aparece no disco em jobs/ e que a documentação cita -- se mudar,
    // os caminhos de exemplo dos docs param de bater.
    assert.equal(
      jobName("cmp", combo),
      "cmp__agent-mini-swe-agent__model-deepseek-deepseek-chat__skill-none"
    );
  });

  test("omite o trecho do model quando não há model", () => {
    assert.equal(jobName("cmp", { ...combo, model: null }), "cmp__agent-mini-swe-agent__skill-none");
  });
});

// --- buildHarborRunArgs -----------------------------------------------------------------

describe("buildHarborRunArgs", () => {
  const base = {
    taskPath: "evals/python/soma-fracoes",
    jobsDir: "jobs",
    name: "cmp__x",
    env: "docker",
    nAttempts: "1",
    extra: [] as string[],
    autoYes: true,
    printConfigOnly: false,
  };

  test("model e skills são opcionais (é o que os torna opcionais na UI)", () => {
    const semModel = buildHarborRunArgs({
      ...base,
      combo: { agent: "oracle", model: null, skillset: { label: "none", paths: [] } },
    });
    assert.ok(!semModel.includes("--model"));
    assert.ok(!semModel.includes("--skill"));

    const comModel = buildHarborRunArgs({
      ...base,
      combo: { agent: "oracle", model: "deepseek/deepseek-chat", skillset: { label: "s", paths: ["/a", "/b"] } },
    });
    assert.deepEqual(
      comModel.slice(comModel.indexOf("--model")),
      ["--model", "deepseek/deepseek-chat", "--skill", "/a", "--skill", "/b", "-y"]
    );
  });

  test("--print-config entra só em dry run", () => {
    const combo = { agent: "oracle", model: null, skillset: { label: "none", paths: [] } };
    assert.ok(!buildHarborRunArgs({ ...base, combo }).includes("--print-config"));
    assert.ok(buildHarborRunArgs({ ...base, combo, printConfigOnly: true }).includes("--print-config"));
  });
});

// --- registries de referência -----------------------------------------------------------

describe("JUDGE_MODELS", () => {
  test("o gate aceita exatamente a lista curada, e nada além", () => {
    for (const m of JUDGE_MODELS) assert.ok(isJudgeModelAllowed(m.value), `${m.value} deveria passar`);
    // O padrão barato do próprio Harbor é bloqueado de propósito: um juiz barato derrota o
    // propósito de julgar (ver DOCUMENTACAO.md §11).
    assert.equal(isJudgeModelAllowed("anthropic/claude-haiku-4-5"), false);
    assert.equal(isJudgeModelAllowed("deepseek/deepseek-chat"), false);
    assert.equal(isJudgeModelAllowed(""), false);
  });
});

describe("HARBOR_AGENTS", () => {
  test("sem duplicatas e com os adapters que a documentação promete", () => {
    const values = HARBOR_AGENTS.map((a) => a.value);
    assert.equal(new Set(values).size, values.length, "há valor duplicado na lista");
    for (const esperado of ["claude-code", "codex", "oracle", "nop", "mini-swe-agent", "terminus", "aider"]) {
      assert.ok(values.includes(esperado), `faltou ${esperado}`);
    }
  });

  test("mini-swe-agent é model-agnostic e claude-code não", () => {
    // Esta distinção é o que decide se dá pra comparar providers diferentes no mesmo agent --
    // foi validada com run real (mini-swe-agent + deepseek/deepseek-chat, reward 1.0).
    const byValue = Object.fromEntries(HARBOR_AGENTS.map((a) => [a.value, a.modelAgnostic]));
    assert.equal(byValue["mini-swe-agent"], true);
    assert.equal(byValue["terminus"], true);
    assert.equal(byValue["claude-code"], false);
    assert.equal(byValue["codex"], false);
  });

  test("os agents sem custo de API existem na lista", () => {
    for (const free of FREE_AGENTS) {
      assert.ok(HARBOR_AGENTS.some((a) => a.value === free), `${free} não está em HARBOR_AGENTS`);
    }
  });
});

describe("PROVIDERS", () => {
  test("todo provider com envKey tem prefixo, e não há envKey repetido", () => {
    const envKeys = PROVIDERS.map((p) => p.envKey).filter(Boolean);
    assert.equal(new Set(envKeys).size, envKeys.length, "envKey duplicado");
    for (const p of PROVIDERS) {
      assert.ok(p.prefixes.length > 0, `${p.id} sem prefixo`);
      for (const prefix of p.prefixes) assert.ok(prefix.endsWith("/"), `prefixo ${prefix} deveria terminar em /`);
    }
  });
});

// --- logs: leitura incremental e path traversal -------------------------------------------

describe("logs do job", () => {
  test("listJobLogs marca como running o job cujo result.json não terminou", () => {
    const root = makeJobsDir();
    try {
      const jobs = listJobLogs(root);
      assert.equal(jobs.length, 1);
      assert.equal(jobs[0].running, true);

      writeFileSync(join(root, "cmp__agent-oracle__skill-none", "result.json"), JSON.stringify({ finished_at: "2026-01-01" }));
      assert.equal(listJobLogs(root)[0].running, false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("listJobLogFiles encontra logs aninhados no trial", () => {
    const root = makeJobsDir();
    try {
      const files = listJobLogFiles(root, "cmp__agent-oracle__skill-none");
      assert.ok(files.includes("job.log"));
      assert.ok(files.includes("trial-1/trial.log"));
      assert.ok(files.includes("trial-1/verifier/reward.txt"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("tailJobLog lê incrementalmente a partir do offset", () => {
    const root = makeJobsDir();
    try {
      const job = "cmp__agent-oracle__skill-none";
      const inteiro = tailJobLog(root, job, "trial-1/trial.log", 0);
      assert.equal(inteiro?.content, "abcdefghij");
      assert.equal(inteiro?.nextOffset, 10);

      const resto = tailJobLog(root, job, "trial-1/trial.log", 4);
      assert.equal(resto?.content, "efghij", "deveria trazer só os bytes novos");

      // Nada novo desde o último poll -- o caso mais comum enquanto uma run está parada.
      assert.equal(tailJobLog(root, job, "trial-1/trial.log", 10)?.content, "");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("offset maior que o arquivo (log reescrito) recomeça do zero em vez de devolver lixo", () => {
    const root = makeJobsDir();
    try {
      const t = tailJobLog(root, "cmp__agent-oracle__skill-none", "trial-1/trial.log", 9999);
      assert.equal(t?.content, "abcdefghij");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("path traversal é recusado nos dois segmentos", () => {
    // Estas rotas são expostas por HTTP; sem isto, um `file` forjado leria qualquer arquivo da
    // máquina -- incluindo o secrets.env. Testado também via HTTP real (retorna 404).
    const root = makeJobsDir();
    try {
      const job = "cmp__agent-oracle__skill-none";
      assert.equal(tailJobLog(root, job, "../../../../etc/passwd", 0), null);
      assert.equal(tailJobLog(root, job, "..\\..\\secrets.env", 0), null);
      assert.equal(tailJobLog(root, "../..", "job.log", 0), null);
      assert.deepEqual(listJobLogFiles(root, "../.."), []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// --- helpers menores ----------------------------------------------------------------------

describe("parseSkillset", () => {
  test("string vazia vira o skillset 'none'", () => {
    assert.deepEqual(parseSkillset(""), { label: "none", paths: [] });
  });

  test("separa por vírgula e rotula pelo basename", () => {
    const s = parseSkillset("/tmp/python-eng, /tmp/testing");
    assert.deepEqual(s.paths, ["/tmp/python-eng", "/tmp/testing"]);
    assert.equal(s.label, "python-eng+testing");
  });
});

describe("buildCombos", () => {
  test("produz o produto cartesiano na ordem agent > model > skillset", () => {
    const combos = buildCombos(["a1", "a2"], ["m1"], [{ label: "none", paths: [] }]);
    assert.equal(combos.length, 2);
    assert.deepEqual(combos.map((c) => c.agent), ["a1", "a2"]);
  });
});

describe("csvEscape", () => {
  test("aspas campos com vírgula, aspas ou quebra de linha", () => {
    assert.equal(csvEscape("simples"), "simples");
    assert.equal(csvEscape("com,virgula"), '"com,virgula"');
    assert.equal(csvEscape('com"aspas'), '"com""aspas"');
    assert.equal(csvEscape(null), "");
    assert.equal(csvEscape(undefined), "");
  });
});

// --- LiteLLM gateway (integration point, off by default) ----------------------------------

describe("gateway LiteLLM", () => {
  // A garantia que importa enquanto está desligado: não muda absolutamente nada. Se este teste
  // quebrar, um ponto de integração inativo passou a interferir em run de verdade.
  test("desligado não contribui nenhuma variável", () => {
    assert.deepEqual(litellmGatewayEnv(LITELLM_GATEWAY_DISABLED, {}), {});
  });

  test("desligado deixa buildHarborEnv idêntico ao de antes da integração existir", () => {
    const semGateway = buildHarborEnv({ FOO: "1" }, {});
    const comPadrao = buildHarborEnv({ FOO: "1" }, litellmGatewayEnv(LITELLM_GATEWAY_DISABLED, {}));
    assert.deepEqual(comPadrao, semGateway);
  });

  test("config pela metade (sem baseUrl) não contribui nada, em vez de meio ligar", () => {
    const meia = { enabled: true, baseUrl: null, apiKeyEnv: null, env: { OPENAI_BASE_URL: "{baseUrl}/v1" } };
    assert.deepEqual(litellmGatewayEnv(meia, {}), {});
  });

  test("ligado substitui {baseUrl} e {apiKey}", () => {
    const cfg = {
      enabled: true,
      baseUrl: "http://127.0.0.1:4000",
      apiKeyEnv: "LITELLM_MASTER_KEY",
      env: { OPENAI_BASE_URL: "{baseUrl}/v1", OPENAI_API_KEY: "{apiKey}" },
    };
    assert.deepEqual(litellmGatewayEnv(cfg, { LITELLM_MASTER_KEY: "chave-do-proxy" }), {
      OPENAI_BASE_URL: "http://127.0.0.1:4000/v1",
      OPENAI_API_KEY: "chave-do-proxy",
    });
  });

  test("secret ausente vira string vazia, não o literal {apiKey}", () => {
    const cfg = { enabled: true, baseUrl: "http://x", apiKeyEnv: "NAO_EXISTE", env: { K: "{apiKey}" } };
    assert.deepEqual(litellmGatewayEnv(cfg, {}), { K: "" });
  });

  test("extraEnv explícito vence o gateway", () => {
    // Precedência importa: um valor passado na chamada é uma decisão daquela run e não pode ser
    // sobrescrito por configuração ambiente.
    const env = buildHarborEnv({ OPENAI_BASE_URL: "https://api.openai.com/v1" }, { OPENAI_BASE_URL: "http://proxy/v1" });
    assert.equal(env.OPENAI_BASE_URL, "https://api.openai.com/v1");
  });
});

describe("rubrics", () => {
  const criteria = [
    { id: "c1", name: "clean_code", description: "É limpo?", guidance: "PASS se idiomático." },
    { id: "c2", name: "no_prolixity", description: "É enxuto?", guidance: "PASS se conciso." },
  ];

  test("resolveRubricCriteria ignora id inexistente em vez de quebrar", () => {
    const r = resolveRubricCriteria(["c1", "fantasma", "c2"], criteria);
    assert.deepEqual(r.map((c) => c.name), ["clean_code", "no_prolixity"]);
  });

  test("serializeRubricToml gera uma seção por critério", () => {
    const toml = serializeRubricToml(resolveRubricCriteria(["c1"], criteria));
    assert.match(toml, /clean_code/);
    assert.match(toml, /PASS se idiomático/);
  });
});
