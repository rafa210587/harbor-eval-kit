import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistryEntry, updateRegistryEntry, deleteRegistryEntry, RegistryNotFoundError } from "./registry-service.ts";
import { readRegistry } from "./paths.ts";
function isolated(fn: () => void) {
  const dir = mkdtempSync(join(tmpdir(), "hek-service-"));
  const old = process.env.HARBOR_EVAL_STATE_DIR;
  process.env.HARBOR_EVAL_STATE_DIR = dir;
  try { fn(); } finally {
    if (old === undefined) delete process.env.HARBOR_EVAL_STATE_DIR; else process.env.HARBOR_EVAL_STATE_DIR = old;
    rmSync(dir, { recursive: true, force: true });
  }
}
test("create assigns ID and update preserves it even with user-supplied ID", () => isolated(() => {
  const item = createRegistryEntry("models", { id: "chosen", label: "M", value: "p/m" });
  assert.notEqual(item.id, "chosen");
  const next = updateRegistryEntry("models", item.id, { id: "../escape", label: "Updated" });
  assert.equal(next.id, item.id);
  assert.deepEqual(readRegistry("models"), [{ id: item.id, label: "Updated", value: "p/m" }]);
}));
test("invalid update cannot replace valid stored data", () => isolated(() => {
  const item = createRegistryEntry("models", { label: "M", value: "p/m" });
  assert.throws(() => updateRegistryEntry("models", item.id, { value: 42 }));
  assert.deepEqual(readRegistry("models"), [item]);
  for (const body of [null, [], "wrong"]) assert.throws(() => createRegistryEntry("models", body));
}));
test("references block invalid creation, updates and deletion until unlinked", () => isolated(() => {
  const model = createRegistryEntry("models", { label: "M", value: "p/m" });
  const agent = createRegistryEntry("agents", { label: "A", agentValue: "oracle", modelId: model.id });
  assert.throws(() => createRegistryEntry("agents", { label: "Bad", agentValue: "oracle", modelId: "missing" }), /referência inexistente/);
  assert.throws(() => updateRegistryEntry("agents", agent.id, { modelId: "missing" }), /referência inexistente/);
  assert.throws(() => deleteRegistryEntry("models", model.id), /item ainda referenciado por agents\.modelId → models/);
  assert.equal(readRegistry("models").length, 1);
  assert.deepEqual(readRegistry("agents"), [agent]);
  updateRegistryEntry("agents", agent.id, { modelId: "" });
  deleteRegistryEntry("models", model.id);
  assert.deepEqual(readRegistry("models"), []);
  assert.throws(() => deleteRegistryEntry("models", model.id), RegistryNotFoundError);
  assert.throws(() => updateRegistryEntry("models", model.id, {}), RegistryNotFoundError);
}));
