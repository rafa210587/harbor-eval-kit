import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeDiscoveredModels, registerDiscoveredModels } from "../../gui/app/provider-domain.js";

test("discovery normalizes before deduplicating provider variants", () => {
  assert.deepEqual(
    normalizeDiscoveredModels(["chat", "deepseek/chat", " chat ", "", "  ", 42], "deepseek"),
    ["deepseek/chat"],
  );
});

test("an empty provider catalog is a normal empty result", () => {
  assert.deepEqual(normalizeDiscoveredModels([], "deepseek"), []);
  assert.deepEqual(normalizeDiscoveredModels(["", "  ", "deepseek/", "/model", null], "deepseek"), []);
});

test("an empty selection reports status without calling the API", async () => {
  const statuses: string[] = [];
  let calls = 0;
  assert.equal(await registerDiscoveredModels(["", "  "], {
    api: async () => { calls++; },
    refreshAll: async () => { calls++; },
    setLocked: () => { calls++; },
    setStatus: (status: string) => { statuses.push(status); },
  }), 0);
  assert.equal(calls, 0);
  assert.deepEqual(statuses, ["Nenhum modelo novo foi marcado para cadastrar."]);
});

test("model registration locks, refreshes, and leaves a success status", async () => {
  const events: string[] = [];
  const requests: unknown[] = [];
  const count = await registerDiscoveredModels(["deepseek/chat"], {
    api: async (...args: unknown[]) => { requests.push(args); return { ok: true }; },
    refreshAll: async () => { events.push("refresh"); },
    setLocked: (locked: boolean) => { events.push(`lock:${locked}`); },
    setStatus: (status: string) => { events.push(`status:${status}`); },
  });
  assert.equal(count, 1);
  assert.deepEqual(requests, [["POST", "/api/models", { label: "deepseek/chat", value: "deepseek/chat" }]]);
  assert.deepEqual(events, [
    "lock:true",
    "status:Cadastrando 1 modelo(s)…",
    "refresh",
    "status:1 modelo(s) cadastrado(s).",
    "lock:false",
  ]);
});

test("a provider registration error is visible and unlocks without a refresh", async () => {
  const events: string[] = [];
  const count = await registerDiscoveredModels(["deepseek/chat"], {
    api: async () => { throw new Error("provider recusou"); },
    refreshAll: async () => { events.push("refresh"); },
    setLocked: (locked: boolean) => { events.push(`lock:${locked}`); },
    setStatus: (status: string) => { events.push(`status:${status}`); },
  });
  assert.equal(count, 0);
  assert.deepEqual(events, [
    "lock:true",
    "status:Cadastrando 1 modelo(s)…",
    "status:Erro ao cadastrar modelos: provider recusou",
    "lock:false",
  ]);
});

test("a response-level refusal is handled like a registration error", async () => {
  const statuses: string[] = [];
  const count = await registerDiscoveredModels(["deepseek/chat"], {
    api: async () => ({ ok: false, error: "modelo inválido" }),
    refreshAll: async () => {},
    setLocked: () => {},
    setStatus: (status: string) => { statuses.push(status); },
  });
  assert.equal(count, 0);
  assert.match(statuses.at(-1) || "", /modelo inválido/);
});

test("Secrets UI exposes discovery and registration status through the pure contract", () => {
  const source = readFileSync(new URL("../../gui/app/secrets.js", import.meta.url), "utf8");
  assert.match(source, /Consultando o catálogo do provider/);
  assert.match(source, /response\.ok === false/);
  assert.match(source, /Erro ao descobrir modelos: \$\{err\.message\}/);
  assert.match(source, /registerBtn\.disabled = locked/);
  assert.match(source, /currentSecretResult\(envKey\)/);
});
