import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  applyLitellmGatewayEnv,
  buildLitellmRuntimeEnv,
  getLitellmGatewayConfig,
  litellmGatewayEnv,
  LITELLM_GATEWAY_DISABLED,
  validateLitellmGatewayConfig,
} from "./litellm.ts";

function validConfig() {
  return {
    enabled: true,
    hostBaseUrl: "http://127.0.0.1:4000",
    containerBaseUrl: "http://gateway.internal:4000",
    inferenceKeyEnv: "LITELLM_INFERENCE_KEY",
    masterKeyEnv: "LITELLM_MASTER_KEY",
    env: { OPENAI_BASE_URL: "{containerBaseUrl}/v1", OPENAI_API_KEY: "{inferenceKey}" },
  };
}

describe("contrato do gateway LiteLLM", () => {
  test("configuração ausente e OFF não alteram o ambiente", () => {
    assert.deepEqual(litellmGatewayEnv(LITELLM_GATEWAY_DISABLED), {});
    const state = mkdtempSync(join(tmpdir(), "harbor-eval-kit-litellm-off-"));
    const previous = process.env.HARBOR_EVAL_STATE_DIR;
    try {
      process.env.HARBOR_EVAL_STATE_DIR = state;
      writeFileSync(join(state, "litellm-gateway.json"), JSON.stringify({ enabled: false, typo: "ignored" }));
      assert.equal(getLitellmGatewayConfig().enabled, false);
    } finally {
      if (previous === undefined) delete process.env.HARBOR_EVAL_STATE_DIR;
      else process.env.HARBOR_EVAL_STATE_DIR = previous;
      rmSync(state, { recursive: true, force: true });
    }
  });

  test("arquivo ON inválido produz diagnóstico em vez de virar OFF", () => {
    const state = mkdtempSync(join(tmpdir(), "harbor-eval-kit-litellm-invalid-"));
    const previous = process.env.HARBOR_EVAL_STATE_DIR;
    try {
      process.env.HARBOR_EVAL_STATE_DIR = state;
      writeFileSync(join(state, "litellm-gateway.json"), JSON.stringify({ enabled: true, baseUrl: "http://127.0.0.1:4000" }));
      assert.throws(() => getLitellmGatewayConfig(), /configuração LiteLLM inválida/);
      writeFileSync(join(state, "litellm-gateway.json"), '{"enabled":true,"synthetic-sensitive-value":');
      assert.throws(() => getLitellmGatewayConfig(), error => {
        assert.ok(!String(error).includes("synthetic-sensitive-value"));
        return /JSON válido/.test(String(error));
      });
    } finally {
      if (previous === undefined) delete process.env.HARBOR_EVAL_STATE_DIR;
      else process.env.HARBOR_EVAL_STATE_DIR = previous;
      rmSync(state, { recursive: true, force: true });
    }
  });

  test("expande endpoint de container e credencial de inferência", () => {
    const cfg = validateLitellmGatewayConfig(validConfig());
    assert.deepEqual(litellmGatewayEnv(cfg, { LITELLM_INFERENCE_KEY: "runtime-value", LITELLM_MASTER_KEY: "admin-value" }), {
      OPENAI_BASE_URL: "http://gateway.internal:4000/v1",
      OPENAI_API_KEY: "runtime-value",
    });
  });

  test("credencial ausente ou vazia bloqueia configuração ligada", () => {
    const cfg = validateLitellmGatewayConfig(validConfig());
    assert.throws(() => litellmGatewayEnv(cfg, {}), /inferência/);
    assert.throws(() => litellmGatewayEnv(cfg, { LITELLM_INFERENCE_KEY: "  " }), /inferência/);
  });

  test("campos, placeholders e nomes de ambiente inválidos são recusados", () => {
    assert.throws(() => validateLitellmGatewayConfig({ ...validConfig(), extra: true }), /desconhecido/);
    assert.throws(() => validateLitellmGatewayConfig({ ...validConfig(), env: { OPENAI_BASE_URL: "{unknown}" } }), /placeholder/);
    assert.throws(() => validateLitellmGatewayConfig({ ...validConfig(), env: { "bad-name": "{containerBaseUrl}" } }), /nome inválido/);
    assert.throws(() => validateLitellmGatewayConfig({ ...validConfig(), masterKeyEnv: "LITELLM_INFERENCE_KEY" }), /diferentes/);
    assert.throws(() => validateLitellmGatewayConfig({ ...validConfig(), env: { OPENAI_API_KEY: "literal-value" } }), /inferenceKey/);
    assert.throws(() => validateLitellmGatewayConfig({ ...validConfig(), env: { DOCKER_HOST: "{hostBaseUrl}" } }), /infraestrutura/);
  });

  test("gateway vence apenas nomes mapeados; extras do provider permanecem", () => {
    assert.deepEqual(applyLitellmGatewayEnv({ OPENAI_API_KEY: "provider-value", PROVIDER_ONLY: "1" }, { OPENAI_API_KEY: "gateway-value", GATEWAY_ONLY: "1" }), {
      OPENAI_API_KEY: "gateway-value",
      PROVIDER_ONLY: "1",
      GATEWAY_ONLY: "1",
    });
  });

  test("runtime env renderiza depois dos extras e mantém infraestrutura do executor", () => {
    const previous = process.env.LITELLM_INFERENCE_KEY;
    const unrelated = process.env.LITELLM_UNRELATED_PROCESS_ONLY;
    process.env.LITELLM_INFERENCE_KEY = "process-value";
    process.env.LITELLM_UNRELATED_PROCESS_ONLY = "must-not-leak";
    try {
      const env = buildLitellmRuntimeEnv({ OPENAI_API_KEY: "provider-value", LITELLM_INFERENCE_KEY: "runtime-value", DOCKER_HOST: "podman-socket", PROVIDER_ONLY: "1", LITELLM_MASTER_KEY: "admin-value" }, validConfig());
      assert.equal(env.OPENAI_API_KEY, "runtime-value");
      assert.equal(env.LITELLM_INFERENCE_KEY, "runtime-value");
      assert.equal(env.PROVIDER_ONLY, "1");
      assert.equal(env.LITELLM_MASTER_KEY, undefined);
      assert.equal(env.LITELLM_UNRELATED_PROCESS_ONLY, undefined);
      assert.equal(env.DOCKER_HOST, "podman-socket");
      assert.equal(env.OPENAI_BASE_URL, "http://gateway.internal:4000/v1");
    } finally {
      if (previous === undefined) delete process.env.LITELLM_INFERENCE_KEY;
      else process.env.LITELLM_INFERENCE_KEY = previous;
      if (unrelated === undefined) delete process.env.LITELLM_UNRELATED_PROCESS_ONLY;
      else process.env.LITELLM_UNRELATED_PROCESS_ONLY = unrelated;
    }
  });

  test("runtime usa só inferência salva, com precedência extras > arquivo > processo", () => {
    const state = mkdtempSync(join(tmpdir(), "harbor-eval-kit-litellm-saved-"));
    const previousState = process.env.HARBOR_EVAL_STATE_DIR;
    const previousKey = process.env.LITELLM_INFERENCE_KEY;
    try {
      process.env.HARBOR_EVAL_STATE_DIR = state;
      process.env.LITELLM_INFERENCE_KEY = "process-fixture";
      writeFileSync(join(state, "secrets.env"), "LITELLM_INFERENCE_KEY=saved-fixture\nLITELLM_MASTER_KEY=admin-fixture\nUNRELATED_KEY=unrelated-fixture\n");
      const env = buildLitellmRuntimeEnv({}, validConfig());
      assert.deepEqual(env, { OPENAI_BASE_URL: "http://gateway.internal:4000/v1", OPENAI_API_KEY: "saved-fixture" });
      assert.equal(buildLitellmRuntimeEnv({ LITELLM_INFERENCE_KEY: "extra-fixture" }, validConfig()).OPENAI_API_KEY, "extra-fixture");
      writeFileSync(join(state, "secrets.env"), "UNRELATED_KEY=unrelated-fixture\n");
      assert.equal(buildLitellmRuntimeEnv({}, validConfig()).OPENAI_API_KEY, "process-fixture");
    } finally {
      if (previousState === undefined) delete process.env.HARBOR_EVAL_STATE_DIR;
      else process.env.HARBOR_EVAL_STATE_DIR = previousState;
      if (previousKey === undefined) delete process.env.LITELLM_INFERENCE_KEY;
      else process.env.LITELLM_INFERENCE_KEY = previousKey;
      rmSync(state, { recursive: true, force: true });
    }
  });
});
